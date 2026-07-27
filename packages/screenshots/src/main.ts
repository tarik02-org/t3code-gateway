import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Playwright } from "effect-playwright";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";

import { regenerateScreenshots, regenerateScreenshotsWithAperture } from "./command.ts";

const outputFlag = Flag.directory("output").pipe(
  Flag.optional,
  Flag.withDescription("Output directory. Defaults to .github/screenshots."),
);

const localCommand = Command.make(
  "local",
  {
    output: outputFlag,
    headful: Flag.boolean("headful").pipe(
      Flag.withDescription("Show the local Chromium window while capturing."),
    ),
    executablePath: Flag.file("executable-path", { mustExist: true }).pipe(
      Flag.optional,
      Flag.withDescription("Use this Chromium executable instead of the managed browser."),
    ),
  },
  ({ executablePath, headful, output }) =>
    regenerateScreenshots({
      browser: {
        kind: "local",
        headless: headful === false,
        executablePath,
      },
      output,
    }),
).pipe(Command.withDescription("Capture through a locally launched Chromium browser."));

const cdpCommand = Command.make(
  "cdp",
  {
    output: outputFlag,
    cdpUrl: Flag.string("cdp-url").pipe(
      Flag.withDescription("Chrome DevTools Protocol endpoint to connect to."),
    ),
  },
  ({ cdpUrl, output }) =>
    regenerateScreenshots({
      browser: { kind: "cdp", cdpUrl },
      output,
    }),
).pipe(Command.withDescription("Capture through an existing Chromium CDP endpoint."));

const apertureCommand = Command.make(
  "aperture",
  {
    output: outputFlag,
    baseUrl: Flag.string("base-url").pipe(
      Flag.withFallbackConfig(Config.string("APERTURE_BASE_URL")),
      Flag.mapTryCatch(
        (baseUrl) => new URL(baseUrl),
        () => "Aperture base URL must be a valid URL.",
      ),
      Flag.withDescription("Aperture origin. Defaults to APERTURE_BASE_URL."),
    ),
    token: Flag.redacted("token").pipe(
      Flag.withFallbackConfig(Config.redacted("APERTURE_TOKEN")),
      Flag.withDescription("Aperture API token. Defaults to APERTURE_TOKEN."),
    ),
    tenantId: Flag.string("tenant-id").pipe(
      Flag.withFallbackConfig(Config.string("APERTURE_TENANT_ID")),
      Flag.optional,
      Flag.withDescription("Tenant ID for a system-admin token. Defaults to APERTURE_TENANT_ID."),
    ),
  },
  ({ baseUrl, output, tenantId, token }) =>
    regenerateScreenshotsWithAperture({
      baseUrl,
      token,
      tenantId,
      output,
    }),
).pipe(
  Command.withDescription(
    "Create a temporary DPR 2 Aperture browser, capture screenshots, and delete it.",
  ),
);

const command = Command.make("screenshots").pipe(
  Command.withDescription("Regenerate the README screenshots with deterministic fake data."),
  Command.withSubcommands([localCommand, cdpCommand, apertureCommand]),
);

NodeRuntime.runMain(
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.provide(Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerFetch, Playwright.layer)),
    Effect.scoped,
  ),
);
