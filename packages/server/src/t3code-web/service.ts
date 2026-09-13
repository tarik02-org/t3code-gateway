import { unzipSync } from "fflate";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";

import type {
  GatewayStatus,
  T3CodeWebChannel,
  UpdateT3CodeWebSettingsRequest,
} from "@t3code-gateway/contracts/schemas";
import { T3CodeWebFailure } from "@t3code-gateway/contracts/schemas";

import { GatewayRuntimeConfig } from "../config.ts";
import { SettingsRepository } from "../db/settings-repository.ts";

const channels = ["stable", "nightly"] as const;

const GitHubRelease = Schema.Struct({
  tag_name: Schema.String,
  prerelease: Schema.Boolean,
  draft: Schema.Boolean,
  assets: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      browser_download_url: Schema.String,
    }),
  ),
});

type GitHubRelease = typeof GitHubRelease.Type;
const GitHubReleases = Schema.Array(GitHubRelease);

const releaseForChannel = (channel: T3CodeWebChannel, releases: ReadonlyArray<GitHubRelease>) =>
  releases.find((release) => {
    if (release.draft) {
      return false;
    }
    return channel === "nightly" ? release.prerelease : release.prerelease === false;
  });

const zipEntryPath = (entry: string, root: string, path: Path.Path) => {
  const normalized = path.normalize(entry);
  if (normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../")) {
    return Effect.fail(
      new T3CodeWebFailure({ message: "T3 Code update contained an unsafe path" }),
    );
  }
  return Effect.succeed(path.join(root, normalized));
};

const archiveRoot = (files: Readonly<Record<string, Uint8Array>>) => {
  if (files["index.html"] !== undefined) {
    return "";
  }
  const roots = new Set(
    Object.keys(files)
      .filter((entry) => entry.length > 0)
      .map((entry) => entry.split("/")[0]),
  );
  if (roots.size !== 1) {
    return null;
  }
  const root = [...roots][0];
  return root !== undefined && files[`${root}/index.html`] !== undefined ? `${root}/` : null;
};

const storageFailure = (message: string) => new T3CodeWebFailure({ message });

export class T3CodeWebService extends Context.Service<
  T3CodeWebService,
  {
    readonly initialize: Effect.Effect<void, T3CodeWebFailure>;
    readonly status: Effect.Effect<GatewayStatus["t3codeWeb"], T3CodeWebFailure>;
    readonly updateSettings: (
      input: UpdateT3CodeWebSettingsRequest,
    ) => Effect.Effect<GatewayStatus["t3codeWeb"], T3CodeWebFailure>;
    readonly checkForUpdates: (
      channel: T3CodeWebChannel,
    ) => Effect.Effect<GatewayStatus["t3codeWeb"], T3CodeWebFailure>;
    readonly runAutomaticUpdate: Effect.Effect<void, T3CodeWebFailure>;
  }
>()("@t3code-gateway/server/t3code-web/service/T3CodeWebService") {}

const makeT3CodeWebService = Effect.fn("makeT3CodeWebService")(function* () {
  const config = yield* GatewayRuntimeConfig;
  const settings = yield* SettingsRepository;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const client = yield* HttpClient.HttpClient;
  const bundledRoot = Option.getOrNull(config.t3codeWebBundledRoot);
  const staticRoot = Option.getOrNull(config.t3codeWebStaticRoot);

  const storagePath = (channel: T3CodeWebChannel) => path.join(config.t3codeWebDataRoot, channel);
  const versionPath = (channel: T3CodeWebChannel) => path.join(storagePath(channel), "version.txt");
  const readSettings = settings.get.pipe(
    Effect.catchTag("DatabaseError", () =>
      Effect.fail(storageFailure("Could not read T3 Code Web settings")),
    ),
  );

  const ensureChannelInstalled = Effect.fn("T3CodeWebService.ensureChannelInstalled")(function* (
    channel: T3CodeWebChannel,
  ) {
    const target = storagePath(channel);
    if (yield* fs.exists(path.join(target, "index.html"))) {
      return;
    }
    if (bundledRoot === null) {
      return;
    }
    const bundled = path.join(bundledRoot, channel);
    if (!(yield* fs.exists(path.join(bundled, "index.html")))) {
      return;
    }
    yield* fs.makeDirectory(config.t3codeWebDataRoot, { recursive: true });
    yield* fs.copy(bundled, target);
  });

  const activate = Effect.fn("T3CodeWebService.activate")(function* (channel: T3CodeWebChannel) {
    if (staticRoot === null) {
      return;
    }
    const target = storagePath(channel);
    if (!(yield* fs.exists(path.join(target, "index.html")))) {
      return;
    }
    yield* fs.makeDirectory(path.dirname(staticRoot), { recursive: true });
    yield* fs.remove(staticRoot, { recursive: true, force: true });
    yield* fs.symlink(target, staticRoot);
  });

  const installedVersion = Effect.fn("T3CodeWebService.installedVersion")(function* (
    channel: T3CodeWebChannel,
  ) {
    const versionFile = versionPath(channel);
    if (!(yield* fs.exists(versionFile))) {
      return null;
    }
    return yield* fs.readFileString(versionFile).pipe(Effect.map((version) => version.trim()));
  });

  const status = Effect.fn("T3CodeWebService.status")(function* () {
    const current = yield* readSettings;
    const stable = yield* installedVersion("stable").pipe(
      Effect.catchTag("PlatformError", () => Effect.succeed(null)),
    );
    const nightly = yield* installedVersion("nightly").pipe(
      Effect.catchTag("PlatformError", () => Effect.succeed(null)),
    );
    return {
      available:
        staticRoot !== null && (stable !== null || nightly !== null || bundledRoot === null),
      channel: current.channel,
      autoUpdate: current.autoUpdate,
      channels: {
        stable: { installedVersion: stable },
        nightly: { installedVersion: nightly },
      },
    } satisfies GatewayStatus["t3codeWeb"];
  });

  const initialize = Effect.fn("T3CodeWebService.initialize")(function* () {
    yield* Effect.forEach(channels, (channel) =>
      ensureChannelInstalled(channel).pipe(
        Effect.catchTag("PlatformError", () =>
          Effect.fail(storageFailure("Could not prepare T3 Code Web files")),
        ),
      ),
    );
    const current = yield* readSettings;
    yield* activate(current.channel).pipe(
      Effect.catchTag("PlatformError", () =>
        Effect.fail(storageFailure("Could not activate T3 Code Web")),
      ),
    );
  });

  const fetchLatestRelease = Effect.fn("T3CodeWebService.fetchLatestRelease")(function* (
    channel: T3CodeWebChannel,
  ) {
    const releasesUrl =
      channel === "stable"
        ? `https://api.github.com/repos/${config.t3codeWebRepository}/releases/latest`
        : `https://api.github.com/repos/${config.t3codeWebRepository}/releases?per_page=20`;
    const response = yield* client
      .get(releasesUrl, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "t3code-gateway",
          "x-github-api-version": "2022-11-28",
        },
      })
      .pipe(
        Effect.catchTag("HttpClientError", () =>
          Effect.fail(storageFailure("Could not check GitHub for T3 Code updates")),
        ),
      );
    if (response.status !== 200) {
      return yield* new T3CodeWebFailure({
        message: "GitHub did not return a T3 Code release",
        status: response.status,
      });
    }
    const body = yield* response.json.pipe(
      Effect.catchTag("HttpClientError", () =>
        Effect.fail(storageFailure("GitHub returned an invalid T3 Code release response")),
      ),
    );
    const releases =
      channel === "stable"
        ? [
            yield* Schema.decodeUnknownEffect(GitHubRelease)(body).pipe(
              Effect.catchTag("SchemaError", () =>
                Effect.fail(storageFailure("GitHub returned an invalid T3 Code release response")),
              ),
            ),
          ]
        : yield* Schema.decodeUnknownEffect(GitHubReleases)(body).pipe(
            Effect.catchTag("SchemaError", () =>
              Effect.fail(storageFailure("GitHub returned an invalid T3 Code release response")),
            ),
          );
    const release = releaseForChannel(channel, releases);
    if (release === undefined) {
      return yield* storageFailure(`GitHub has no ${channel} T3 Code release`);
    }
    if (!/^v[0-9][A-Za-z0-9.-]*$/.test(release.tag_name)) {
      return yield* storageFailure("GitHub returned an invalid T3 Code release tag");
    }
    const version = release.tag_name.slice(1);
    const assetName = `T3-Code-Web-${version}.zip`;
    const asset = release.assets.find((candidate) => candidate.name === assetName);
    if (asset === undefined) {
      return yield* storageFailure(`GitHub release ${release.tag_name} has no Web asset`);
    }
    return { version, url: asset.browser_download_url };
  });

  const download = Effect.fn("T3CodeWebService.download")(function* (channel: T3CodeWebChannel) {
    const release = yield* fetchLatestRelease(channel);
    const current = yield* installedVersion(channel);
    if (current === release.version) {
      return;
    }
    const response = yield* client
      .get(release.url)
      .pipe(
        Effect.catchTag("HttpClientError", () =>
          Effect.fail(storageFailure("Could not download the T3 Code Web update")),
        ),
      );
    if (response.status !== 200) {
      return yield* new T3CodeWebFailure({
        message: "GitHub did not return the T3 Code Web update",
        status: response.status,
      });
    }
    const buffer = yield* response.arrayBuffer.pipe(
      Effect.catchTag("HttpClientError", () =>
        Effect.fail(storageFailure("Could not read the T3 Code Web update")),
      ),
    );
    const files = yield* Effect.try({
      try: () => unzipSync(new Uint8Array(buffer)),
      catch: () => storageFailure("The T3 Code Web update was not a valid ZIP archive"),
    });
    const root = archiveRoot(files);
    if (root === null) {
      return yield* storageFailure("The T3 Code Web update did not contain index.html");
    }
    const temporary = path.join(config.t3codeWebDataRoot, `.${channel}-${release.version}`);
    const target = storagePath(channel);
    yield* fs.remove(temporary, { recursive: true, force: true });
    yield* fs.makeDirectory(temporary, { recursive: true });
    for (const [entry, content] of Object.entries(files)) {
      if (!entry.startsWith(root)) {
        return yield* storageFailure("The T3 Code Web update contained an invalid archive layout");
      }
      const relativeEntry = entry.slice(root.length);
      if (relativeEntry.endsWith("/")) {
        continue;
      }
      const output = yield* zipEntryPath(relativeEntry, temporary, path);
      yield* fs.makeDirectory(path.dirname(output), { recursive: true });
      yield* fs.writeFile(output, content);
    }
    if (!(yield* fs.exists(path.join(temporary, "index.html")))) {
      return yield* storageFailure("The T3 Code Web update did not contain index.html");
    }
    yield* fs.writeFileString(path.join(temporary, "version.txt"), release.version);
    yield* fs.remove(target, { recursive: true, force: true });
    yield* fs.rename(temporary, target);
    yield* activate(channel);
  });

  const updateSettings = Effect.fn("T3CodeWebService.updateSettings")(function* (
    input: UpdateT3CodeWebSettingsRequest,
  ) {
    const current = yield* readSettings;
    const nextChannel = input.channel ?? current.channel;
    yield* ensureChannelInstalled(nextChannel).pipe(
      Effect.catchTag("PlatformError", () =>
        Effect.fail(storageFailure("Could not prepare T3 Code Web files")),
      ),
    );
    const nextChannelInstalled = yield* fs
      .exists(path.join(storagePath(nextChannel), "index.html"))
      .pipe(
        Effect.catchTag("PlatformError", () =>
          Effect.fail(storageFailure("Could not inspect T3 Code Web files")),
        ),
      );
    if (!nextChannelInstalled) {
      return yield* storageFailure(`The ${nextChannel} T3 Code Web channel is unavailable`);
    }
    if (nextChannel !== current.channel) {
      yield* activate(nextChannel).pipe(
        Effect.catchTag("PlatformError", () =>
          Effect.fail(storageFailure("Could not activate T3 Code Web")),
        ),
      );
    }
    const nextSettings = {
      updatedAt: DateTime.formatIso(yield* DateTime.now),
      ...(input.channel === undefined ? {} : { channel: input.channel }),
      ...(input.autoUpdate === undefined ? {} : { autoUpdate: input.autoUpdate }),
    };
    yield* settings
      .update(nextSettings)
      .pipe(
        Effect.catchTag("DatabaseError", () =>
          Effect.fail(storageFailure("Could not save T3 Code Web settings")),
        ),
      );
    return yield* status();
  });

  const checkForUpdates = Effect.fn("T3CodeWebService.checkForUpdates")(function* (
    channel: T3CodeWebChannel,
  ) {
    yield* download(channel).pipe(
      Effect.catchTag("PlatformError", () =>
        Effect.fail(storageFailure("Could not install the T3 Code Web update")),
      ),
    );
    return yield* status();
  });

  const runAutomaticUpdate = Effect.fn("T3CodeWebService.runAutomaticUpdate")(function* () {
    const current = yield* readSettings;
    if (current.autoUpdate) {
      yield* checkForUpdates(current.channel);
    }
  });

  return {
    initialize: initialize(),
    status: status(),
    updateSettings,
    checkForUpdates,
    runAutomaticUpdate: runAutomaticUpdate(),
  };
});

export const T3CodeWebServiceLive = Layer.effect(T3CodeWebService, makeT3CodeWebService());
