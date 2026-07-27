import { chromium, Playwright, PlaywrightPage } from "effect-playwright";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpRouter from "effect/unstable/http/HttpRouter";

import { screenshotRpcLayer } from "./fixtures.ts";

export class BrowserContextUnavailableError extends Schema.TaggedErrorClass<BrowserContextUnavailableError>()(
  "BrowserContextUnavailableError",
  { message: Schema.String },
) {}

export type BrowserMode =
  | {
      readonly kind: "local";
      readonly headless: boolean;
      readonly executablePath: Option.Option<string>;
    }
  | {
      readonly kind: "cdp";
      readonly cdpUrl: string;
    };

export interface CaptureScreenshotsInput {
  readonly browser: BrowserMode;
  readonly distDirectory: string;
  readonly output: string;
}

const virtualOrigin = "http://t3code-gateway.test";
const virtualAdminUrl = `${virtualOrigin}/admin/`;
const gatewayRpcUrlPattern = new URLPattern({ pathname: "/api/gateway/rpc{/}?" });

class ScreenshotOutput extends Context.Service<ScreenshotOutput, { readonly directory: string }>()(
  "@t3code-gateway/screenshots/capture/ScreenshotOutput",
) {}

const openAdminPage = Effect.gen(function* () {
  const page = yield* PlaywrightPage;
  yield* page.setViewportSize({ width: 1440, height: 1000 });
  yield* page.goto(virtualAdminUrl, { waitUntil: "domcontentloaded" });
  yield* page.getByRole("row", { name: /Workstation/ }).waitFor({ state: "visible" });
  yield* page.evaluate(() => document.fonts.ready.then(() => undefined));
});

const pageHeight = Effect.gen(function* () {
  const page = yield* PlaywrightPage;
  const [headerHeight, content] = yield* Effect.all([
    page
      .locator("main > header")
      .evaluate((header: HTMLElement) => header.getBoundingClientRect().height),
    page.locator("main > div > div").evaluate((content: HTMLElement) => ({
      bottomGutter: Number.parseFloat(getComputedStyle(content).paddingBottom),
      contentHeight: content.scrollHeight,
    })),
  ]);
  return Math.ceil(headerHeight + content.contentHeight + content.bottomGutter);
});

const dialogHeight = Effect.gen(function* () {
  const page = yield* PlaywrightPage;
  const [contentHeight, activeDialogHeight, rootFontSize] = yield* Effect.all([
    pageHeight,
    page
      .locator("[role=dialog]")
      .evaluate((dialog: HTMLElement) =>
        Math.max(dialog.getBoundingClientRect().height, dialog.scrollHeight),
      ),
    page
      .locator("html")
      .evaluate((root: HTMLElement) => Number.parseFloat(getComputedStyle(root).fontSize)),
  ]);
  return Math.ceil(Math.max(contentHeight, activeDialogHeight + rootFontSize * 12));
});

const captureScreenshot = Effect.fn("screenshots.captureFixture")(function* ({
  fileName,
  height,
}: {
  readonly fileName: string;
  readonly height: number;
}) {
  const page = yield* PlaywrightPage;
  const output = yield* ScreenshotOutput;
  const path = yield* Path.Path;
  const outputPath = path.join(output.directory, fileName);
  yield* page.setViewportSize({ width: 1440, height });
  yield* page
    .screenshot({
      path: outputPath,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    })
    .pipe(Effect.retry({ times: 1 }));
  yield* Effect.logInfo("Captured README screenshot").pipe(
    Effect.annotateLogs({
      height,
      path: outputPath,
      width: 1440,
    }),
  );
});

const fixtures = [
  Effect.gen(function* () {
    yield* openAdminPage;
    const height = yield* pageHeight;
    yield* captureScreenshot({ fileName: "admin-environments.png", height });
  }),
  Effect.gen(function* () {
    const page = yield* PlaywrightPage;
    yield* openAdminPage;
    yield* page.getByRole("button", { name: "Add environment", exact: true }).click();
    yield* page.getByPlaceholder("Desktop", { exact: true }).fill("Design Studio");
    yield* page
      .getByPlaceholder("https://backend.example.com", { exact: true })
      .fill("https://design-studio.internal.example.com");
    yield* page.getByPlaceholder("PAIRCODE", { exact: true }).fill("T3-DEMO-2026");
    yield* page
      .getByRole("dialog", { name: "Add environment", exact: true })
      .waitFor({ state: "visible" });
    const height = yield* dialogHeight;
    yield* captureScreenshot({ fileName: "add-environment.png", height });
  }),
  Effect.gen(function* () {
    const page = yield* PlaywrightPage;
    yield* openAdminPage;
    yield* page.getByRole("button", { name: "Edit", exact: true }).first().click();
    yield* page
      .getByRole("dialog", { name: "Edit environment", exact: true })
      .waitFor({ state: "visible" });
    const height = yield* dialogHeight;
    yield* captureScreenshot({ fileName: "edit-environment.png", height });
  }),
  Effect.gen(function* () {
    const page = yield* PlaywrightPage;
    yield* openAdminPage;
    yield* page.getByRole("switch", { name: "Add Workstation to web", exact: true }).click();
    yield* page.getByPlaceholder("Workstation", { exact: true }).fill("Demo laptop");
    const height = yield* pageHeight;
    yield* captureScreenshot({ fileName: "web-enrollment.png", height });
  }),
  Effect.gen(function* () {
    const page = yield* PlaywrightPage;
    yield* openAdminPage;
    yield* page.getByRole("button", { name: "Pair", exact: true }).first().click();
    yield* page.getByPlaceholder("MacBook", { exact: true }).fill("Demo laptop");
    yield* page
      .getByRole("dialog", { name: "Create pairing link", exact: true })
      .waitFor({ state: "visible" });
    const height = yield* dialogHeight;
    yield* captureScreenshot({ fileName: "pairing-link.png", height });
  }),
  Effect.gen(function* () {
    const page = yield* PlaywrightPage;
    yield* openAdminPage;
    yield* page.getByRole("button", { name: "Sessions", exact: true }).first().click();
    yield* page
      .getByRole("dialog", { name: "Authorized clients", exact: true })
      .getByText("CLI automation", { exact: true })
      .waitFor({ state: "visible" });
    const height = yield* dialogHeight;
    yield* captureScreenshot({ fileName: "authorized-clients.png", height });
  }),
];

export const captureScreenshots = Effect.fn("screenshots.capture")(function* ({
  browser: browserMode,
  distDirectory,
  output,
}: CaptureScreenshotsInput) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const playwright = yield* Playwright;
  const outputDirectory = path.resolve(output);
  yield* fileSystem.makeDirectory(outputDirectory, { recursive: true });

  const browser =
    browserMode.kind === "local"
      ? yield* playwright.launchScoped(
          chromium,
          Option.match(browserMode.executablePath, {
            onNone: () => ({ headless: browserMode.headless }),
            onSome: (executablePath) => ({
              executablePath,
              headless: browserMode.headless,
            }),
          }),
        )
      : yield* playwright.connectCDPScoped(browserMode.cdpUrl);
  const context =
    browserMode.kind === "local"
      ? yield* browser.newContext({
          colorScheme: "dark",
          locale: "en-US",
          reducedMotion: "reduce",
          serviceWorkers: "block",
          timezoneId: "UTC",
          viewport: { width: 1440, height: 1000 },
        })
      : browser.contexts().at(-1);
  if (context === undefined) {
    return yield* new BrowserContextUnavailableError({
      message: "The CDP browser has no context to capture.",
    });
  }

  const page = yield* context.newPage;
  yield* Effect.addFinalizer(() => page.close.pipe(Effect.ignore));

  yield* page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });

  const screenshotRpc = HttpRouter.toWebHandler(screenshotRpcLayer, { disableLogger: true });
  yield* Effect.addFinalizer(() => Effect.promise(() => screenshotRpc.dispose()));

  // effect-playwright does not expose Page.route, so native Playwright is isolated here.
  yield* page.use((nativePage) =>
    nativePage.route(`${virtualOrigin}/**`, async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      if (gatewayRpcUrlPattern.test(requestUrl)) {
        const response = await screenshotRpc.handler(
          new Request(requestUrl, {
            body: request.postData(),
            headers: request.headers(),
            method: request.method(),
          }),
        );
        return route.fulfill({
          body: await response.text(),
          headers: Object.fromEntries(response.headers),
          status: response.status,
        });
      }

      const pathname = new URL(requestUrl).pathname;
      const relativeAssetPath =
        pathname === "/admin" || pathname === "/admin/"
          ? "index.html"
          : pathname.startsWith("/admin/")
            ? pathname.slice("/admin/".length)
            : null;
      if (relativeAssetPath === null || relativeAssetPath.length === 0) {
        return route.fulfill({ status: 404, body: "Not Found" });
      }
      return route.fulfill({ path: path.join(distDirectory, relativeAssetPath) });
    }),
  );

  yield* Effect.all(fixtures, { concurrency: 1, discard: true }).pipe(
    Effect.provideService(PlaywrightPage, page),
    Effect.provideService(ScreenshotOutput, { directory: outputDirectory }),
  );
});
