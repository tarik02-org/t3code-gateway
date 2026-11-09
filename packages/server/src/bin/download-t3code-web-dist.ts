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
    tag: "v0.1.7",
    sha256: "93201576f7cdddceb1e704362fc2a989a3dd3c51498b26258401626200d8efca",
  },
  {
    channel: "nightly",
    // renovate: datasource=github-release-attachments depName=t3code-web-nightly packageName=tarik02-org/t3code-web-builds
    tag: "v0.1.8-nightly.20261109.4392",
    sha256: "501664947867e9a3631bbce7379818d49f82bfd248c9b92d0d47e7668aa672d7",
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
