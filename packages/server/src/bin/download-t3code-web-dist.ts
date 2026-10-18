import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";

import {
  makeReleaseArchiveInstaller,
  releaseAssetName,
  webBuildsRepository,
} from "../t3code-web/release-archive.ts";

const bundledReleases = [
  {
    channel: "stable",
    // renovate: datasource=github-release-attachments depName=t3code-web-stable packageName=tarik02-org/t3code-web-builds
    tag: "v0.1.0",
    sha256: "478af6d939d156d43c1c3c956c1a62b392e4973f4bf89027b6c6ee04a3f4d70e",
  },
  {
    channel: "nightly",
    // renovate: datasource=github-release-attachments depName=t3code-web-nightly packageName=tarik02-org/t3code-web-builds
    tag: "v0.1.1-nightly.20261018.3302",
    sha256: "ce07220efd7974d457ef092c2f99e82b00cd624cc2c59fc9007fd3ad9856dbc0",
  },
] as const;

const command = Command.make(
  "download-t3code-web-dist",
  {
    output: Flag.Directory("output").pipe(
      Flag.withDefault("packaging/runtime/t3code-web-dist"),
      Flag.withDescription("Directory that receives one web app per channel."),
    ),
  },
  Effect.fn(function* ({ output }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const installReleaseArchive = yield* makeReleaseArchiveInstaller;

    yield* fs.remove(output, { recursive: true, force: true });
    yield* fs.makeDirectory(output, { recursive: true });
    yield* Effect.forEach(
      bundledReleases,
      Effect.fn(function* (release) {
        const version = release.tag.slice(1);
        yield* Effect.logInfo(`Downloading T3 Code ${release.channel} ${version}`);
        yield* installReleaseArchive(
          {
            version,
            url: `https://github.com/${webBuildsRepository}/releases/download/${release.tag}/${releaseAssetName(version)}`,
            sha256: release.sha256,
          },
          path.join(output, release.channel),
        );
      }),
      { concurrency: "unbounded", discard: true },
    );
  }),
).pipe(Command.withDescription("Download the T3 Code web apps bundled into the container."));

NodeRuntime.runMain(
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.provide(Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerFetch)),
  ),
);
