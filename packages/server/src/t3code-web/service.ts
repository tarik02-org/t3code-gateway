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
  T3CodeWebVersionSource,
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
type VersionRecord = {
  readonly channel: T3CodeWebChannel;
  readonly version: string;
  readonly source: T3CodeWebVersionSource;
  readonly root: string;
};

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

const selectPreferred = (records: ReadonlyArray<VersionRecord>, pinnedVersion: string | null) => {
  const pinned =
    pinnedVersion === null ? undefined : records.find((record) => record.version === pinnedVersion);
  if (pinned !== undefined) {
    return pinned;
  }
  return records.toSorted((left, right) => left.version.localeCompare(right.version)).at(-1);
};

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
    readonly activateVersion: (
      channel: T3CodeWebChannel,
      version: string,
    ) => Effect.Effect<GatewayStatus["t3codeWeb"], T3CodeWebFailure>;
    readonly removeVersion: (
      channel: T3CodeWebChannel,
      version: string,
    ) => Effect.Effect<GatewayStatus["t3codeWeb"], T3CodeWebFailure>;
    readonly setVersionPin: (
      channel: T3CodeWebChannel,
      version: string | null,
    ) => Effect.Effect<GatewayStatus["t3codeWeb"], T3CodeWebFailure>;
    readonly garbageCollect: Effect.Effect<GatewayStatus["t3codeWeb"], T3CodeWebFailure>;
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
  const downloadedRoot = path.join(config.t3codeWebDataRoot, "versions");

  const downloadedChannelRoot = (channel: T3CodeWebChannel) => path.join(downloadedRoot, channel);
  const bundledChannelRoot = (channel: T3CodeWebChannel) =>
    bundledRoot === null ? null : path.join(bundledRoot, channel);
  const readSettings = settings.get.pipe(
    Effect.catchTag("DatabaseError", () =>
      Effect.fail(storageFailure("Could not read T3 Code Web settings")),
    ),
  );

  const listChannelVersions = Effect.fn("T3CodeWebService.listChannelVersions")(function* (
    channel: T3CodeWebChannel,
  ) {
    const records: Array<VersionRecord> = [];
    const bundled = bundledChannelRoot(channel);
    if (bundled !== null && (yield* fs.exists(path.join(bundled, "index.html")))) {
      records.push({
        channel,
        version: (yield* fs.readFileString(path.join(bundled, "version.txt"))).trim(),
        source: "bundled",
        root: bundled,
      });
    }

    const downloaded = downloadedChannelRoot(channel);
    if (yield* fs.exists(downloaded)) {
      for (const entry of yield* fs.readDirectory(downloaded)) {
        const root = path.join(downloaded, entry);
        if (!(yield* fs.exists(path.join(root, "index.html")))) {
          continue;
        }
        records.push({
          channel,
          version: (yield* fs.readFileString(path.join(root, "version.txt"))).trim(),
          source: "downloaded",
          root,
        });
      }
    }
    return records;
  });

  const activeTarget = Effect.fn("T3CodeWebService.activeTarget")(function* () {
    if (staticRoot === null || !(yield* fs.exists(staticRoot))) {
      return null;
    }
    return yield* fs.readLink(staticRoot);
  });

  const activateRoot = Effect.fn("T3CodeWebService.activateRoot")(function* (root: string) {
    if (staticRoot === null) {
      return;
    }
    yield* fs.makeDirectory(path.dirname(staticRoot), { recursive: true });
    yield* fs.remove(staticRoot, { recursive: true, force: true });
    yield* fs.symlink(root, staticRoot);
  });

  const status = Effect.fn("T3CodeWebService.status")(function* () {
    const current = yield* readSettings;
    const active = yield* activeTarget().pipe(
      Effect.catchTag("PlatformError", () => Effect.succeed(null)),
    );
    const records: Array<VersionRecord> = [];
    for (const channel of channels) {
      records.push(...(yield* listChannelVersions(channel)));
    }
    return {
      available: staticRoot !== null && records.length > 0,
      updateChannel: current.updateChannel,
      autoUpdate: current.autoUpdate,
      autoGc: current.autoGc,
      keepRecent: current.keepRecent,
      versions: records
        .map((record) => ({
          channel: record.channel,
          version: record.version,
          source: record.source,
          active: active === record.root,
          pinned:
            record.source === "bundled" ||
            current.pinnedVersions[record.channel] === record.version,
          forcedPinned: record.source === "bundled",
        }))
        .toSorted((left, right) =>
          left.channel === right.channel
            ? right.version.localeCompare(left.version)
            : left.channel.localeCompare(right.channel),
        ),
    } satisfies GatewayStatus["t3codeWeb"];
  });

  const findVersion = Effect.fn("T3CodeWebService.findVersion")(function* (
    channel: T3CodeWebChannel,
    version: string,
  ) {
    return (yield* listChannelVersions(channel)).find((record) => record.version === version);
  });

  const initialize = Effect.fn("T3CodeWebService.initialize")(function* () {
    yield* fs.makeDirectory(downloadedRoot, { recursive: true });
    const current = yield* readSettings;
    const records = yield* listChannelVersions(current.updateChannel);
    const preferred = selectPreferred(records, current.pinnedVersions[current.updateChannel]);
    if (preferred !== undefined) {
      yield* activateRoot(preferred.root).pipe(
        Effect.catchTag("PlatformError", () =>
          Effect.fail(storageFailure("Could not activate T3 Code Web")),
        ),
      );
    }
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
    const current = yield* listChannelVersions(channel);
    if (current.some((record) => record.version === release.version)) {
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
    const channelRoot = downloadedChannelRoot(channel);
    const temporary = path.join(channelRoot, `.${release.version}`);
    const target = path.join(channelRoot, release.version);
    yield* fs.makeDirectory(channelRoot, { recursive: true });
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
  });

  const updateSettings = Effect.fn("T3CodeWebService.updateSettings")(function* (
    input: UpdateT3CodeWebSettingsRequest,
  ) {
    const nextSettings = {
      updatedAt: DateTime.formatIso(yield* DateTime.now),
      ...(input.updateChannel === undefined ? {} : { updateChannel: input.updateChannel }),
      ...(input.autoUpdate === undefined ? {} : { autoUpdate: input.autoUpdate }),
      ...(input.autoGc === undefined ? {} : { autoGc: input.autoGc }),
      ...(input.keepRecent === undefined ? {} : { keepRecent: input.keepRecent }),
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
    const current = yield* readSettings;
    if (current.pinnedVersions[channel] === null) {
      const records = yield* listChannelVersions(channel);
      const preferred = selectPreferred(records, null);
      if (preferred !== undefined) {
        yield* activateRoot(preferred.root);
      }
    }
    return yield* status();
  });

  const activateVersion = Effect.fn("T3CodeWebService.activateVersion")(function* (
    channel: T3CodeWebChannel,
    version: string,
  ) {
    const record = yield* findVersion(channel, version);
    if (record === undefined) {
      return yield* storageFailure(`T3 Code ${channel} version ${version} is unavailable`);
    }
    yield* activateRoot(record.root);
    yield* settings.update({
      pinnedVersions: { [channel]: version },
      updatedAt: DateTime.formatIso(yield* DateTime.now),
    });
    return yield* status();
  });

  const removeVersion = Effect.fn("T3CodeWebService.removeVersion")(function* (
    channel: T3CodeWebChannel,
    version: string,
  ) {
    const record = yield* findVersion(channel, version);
    if (record === undefined) {
      return yield* storageFailure(`T3 Code ${channel} version ${version} is unavailable`);
    }
    if (record.source === "bundled") {
      return yield* storageFailure("Bundled T3 Code versions cannot be removed");
    }
    const current = yield* readSettings;
    const active = yield* activeTarget();
    if (active === record.root) {
      return yield* storageFailure("The active T3 Code version cannot be removed");
    }
    if (current.pinnedVersions[channel] === version) {
      return yield* storageFailure("Pinned T3 Code versions cannot be removed");
    }
    yield* fs.remove(record.root, { recursive: true, force: true });
    return yield* status();
  });

  const setVersionPin = Effect.fn("T3CodeWebService.setVersionPin")(function* (
    channel: T3CodeWebChannel,
    version: string | null,
  ) {
    if (version !== null) {
      const record = yield* findVersion(channel, version);
      if (record === undefined) {
        return yield* storageFailure(`T3 Code ${channel} version ${version} is unavailable`);
      }
    }
    yield* settings.update({
      pinnedVersions: { [channel]: version },
      updatedAt: DateTime.formatIso(yield* DateTime.now),
    });
    return yield* status();
  });

  const garbageCollect = Effect.fn("T3CodeWebService.garbageCollect")(function* () {
    const current = yield* readSettings;
    const active = yield* activeTarget();
    for (const channel of channels) {
      const records = yield* listChannelVersions(channel);
      const recentDownloaded = records
        .filter((record) => record.source === "downloaded")
        .toSorted((left, right) => right.version.localeCompare(left.version))
        .slice(0, current.keepRecent[channel]);
      const recentVersions = new Set(recentDownloaded.map((record) => record.version));
      for (const record of records) {
        if (
          record.source === "downloaded" &&
          active !== record.root &&
          current.pinnedVersions[channel] !== record.version &&
          !recentVersions.has(record.version)
        ) {
          yield* fs.remove(record.root, { recursive: true, force: true });
        }
      }
    }
    return yield* status();
  });

  const runAutomaticUpdate = Effect.fn("T3CodeWebService.runAutomaticUpdate")(function* () {
    const current = yield* readSettings;
    if (current.autoUpdate) {
      yield* checkForUpdates(current.updateChannel);
    }
    if (current.autoGc) {
      yield* garbageCollect();
    }
  });

  return {
    initialize: initialize().pipe(
      Effect.catchTag("PlatformError", () =>
        Effect.fail(storageFailure("Could not initialize T3 Code Web versions")),
      ),
    ),
    status: status().pipe(
      Effect.catchTag("PlatformError", () =>
        Effect.fail(storageFailure("Could not inspect T3 Code Web versions")),
      ),
    ),
    updateSettings: (input: UpdateT3CodeWebSettingsRequest) =>
      updateSettings(input).pipe(
        Effect.catchTag("PlatformError", () =>
          Effect.fail(storageFailure("Could not update T3 Code settings")),
        ),
      ),
    checkForUpdates: (channel: T3CodeWebChannel) =>
      checkForUpdates(channel).pipe(
        Effect.catchTag("PlatformError", () =>
          Effect.fail(storageFailure("Could not check T3 Code Web versions")),
        ),
      ),
    activateVersion: (channel: T3CodeWebChannel, version: string) =>
      activateVersion(channel, version).pipe(
        Effect.catchTags({
          DatabaseError: () =>
            Effect.fail(storageFailure("Could not save the active T3 Code version")),
          PlatformError: () =>
            Effect.fail(storageFailure("Could not activate the T3 Code Web version")),
        }),
      ),
    removeVersion: (channel: T3CodeWebChannel, version: string) =>
      removeVersion(channel, version).pipe(
        Effect.catchTag("PlatformError", () =>
          Effect.fail(storageFailure("Could not remove the T3 Code Web version")),
        ),
      ),
    setVersionPin: (channel: T3CodeWebChannel, version: string | null) =>
      setVersionPin(channel, version).pipe(
        Effect.catchTags({
          DatabaseError: () =>
            Effect.fail(storageFailure("Could not save the T3 Code version pin")),
          PlatformError: () =>
            Effect.fail(storageFailure("Could not update the T3 Code version pin")),
        }),
      ),
    garbageCollect: garbageCollect().pipe(
      Effect.catchTag("PlatformError", () =>
        Effect.fail(storageFailure("Could not garbage-collect T3 Code versions")),
      ),
    ),
    runAutomaticUpdate: runAutomaticUpdate().pipe(
      Effect.catchTag("PlatformError", () =>
        Effect.fail(storageFailure("Could not run automatic T3 Code updates")),
      ),
    ),
  };
});

export const T3CodeWebServiceLive = Layer.effect(T3CodeWebService, makeT3CodeWebService());
