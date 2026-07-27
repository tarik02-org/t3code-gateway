import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";

import { captureScreenshotsWithAperture } from "./aperture.ts";
import { type BrowserMode, captureScreenshots } from "./capture.ts";

export interface RegenerateScreenshotsInput {
  readonly browser: BrowserMode;
  readonly output: Option.Option<string>;
}

export interface RegenerateScreenshotsWithApertureInput {
  readonly baseUrl: URL;
  readonly token: Redacted.Redacted<string>;
  readonly tenantId: Option.Option<string>;
  readonly output: Option.Option<string>;
}

export const regenerateScreenshots = Effect.fn("screenshots.regenerate")(function* ({
  browser,
  output,
}: RegenerateScreenshotsInput) {
  const path = yield* Path.Path;
  const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

  return yield* captureScreenshots({
    browser,
    distDirectory: path.join(repositoryRoot, "packages/web/dist/client"),
    output: Option.getOrElse(output, () => path.join(repositoryRoot, ".github/screenshots")),
  });
});

export const regenerateScreenshotsWithAperture: (
  input: RegenerateScreenshotsWithApertureInput,
) => ReturnType<typeof captureScreenshotsWithAperture> = Effect.fn(
  "screenshots.regenerateWithAperture",
)(function* ({ baseUrl, token, tenantId, output }: RegenerateScreenshotsWithApertureInput) {
  const path = yield* Path.Path;
  const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

  return yield* captureScreenshotsWithAperture({
    baseUrl,
    token,
    tenantId,
    distDirectory: path.join(repositoryRoot, "packages/web/dist/client"),
    output: Option.getOrElse(output, () => path.join(repositoryRoot, ".github/screenshots")),
  });
});
