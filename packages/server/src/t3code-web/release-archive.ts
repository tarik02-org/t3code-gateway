import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as Tar from "tar";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/http/HttpClient";

import { T3CodeWebFailure } from "@t3code-gateway/contracts/schemas";

export const upstreamRepository = "pingdotgg/t3code";

// Upstream publishes no standalone web build; every CLI tarball carries it in `client/`, and the
// web app is the same for every platform.
export const releaseAssetName = (version: string) => `t3-${version}-linux-x64.tar.gz`;

const clientEntry = /^[^/]+\/client\/./;

export type T3CodeWebReleaseArchive = {
  readonly version: string;
  readonly url: string;
  /** Hex SHA-256 of the archive, or null when GitHub does not report one. */
  readonly sha256: string | null;
};

const failure = (message: string) => new T3CodeWebFailure({ message });

export const makeReleaseArchiveInstaller = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);

  /** Downloads a CLI tarball and installs its web app into `target`, replacing what is there. */
  return Effect.fn("installReleaseArchive")(function* (
    release: T3CodeWebReleaseArchive,
    target: string,
  ) {
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}`);

    const response = yield* client.get(release.url).pipe(
      Effect.catchTag("HttpClientError", (error) =>
        Effect.fail(
          error.response === undefined
            ? failure("Could not download the T3 Code Web update")
            : new T3CodeWebFailure({
                message: "GitHub did not return the T3 Code Web update",
                status: error.response.status,
              }),
        ),
      ),
    );

    const install = Effect.gen(function* () {
      yield* fs.remove(temporary, { recursive: true, force: true });
      yield* fs.makeDirectory(temporary, { recursive: true });

      const hash = createHash("sha256");
      const body = response.stream.pipe(
        Stream.tap((chunk) => Effect.sync(() => hash.update(chunk))),
      );
      yield* Effect.tryPromise({
        try: (signal) =>
          pipeline(
            Readable.from(Stream.toAsyncIterable(body)),
            Tar.x({
              cwd: temporary,
              strip: 2,
              filter: (entryPath, entry) =>
                clientEntry.test(entryPath) &&
                !entryPath.endsWith(".map") &&
                entry instanceof Tar.ReadEntry &&
                (entry.type === "File" || entry.type === "Directory"),
            }),
            { signal },
          ),
        catch: () => failure("Could not unpack the T3 Code Web update"),
      });
      if (release.sha256 !== null && hash.digest("hex") !== release.sha256) {
        return yield* failure("The T3 Code Web update did not match its checksum");
      }
      if (!(yield* fs.exists(path.join(temporary, "index.html")))) {
        return yield* failure("The T3 Code Web update did not contain index.html");
      }
      yield* fs.writeFileString(path.join(temporary, "version.txt"), release.version);
      yield* fs.remove(target, { recursive: true, force: true });
      yield* fs.rename(temporary, target);
    });

    yield* install.pipe(
      Effect.ensuring(fs.remove(temporary, { recursive: true, force: true }).pipe(Effect.ignore)),
    );
  });
});
