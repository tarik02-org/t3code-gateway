import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as HttpClient from "effect/http/HttpClient";

import { T3CodeWebFailure } from "@t3code-gateway/contracts/schemas";

// Upstream publishes its hosted web app only to its own deployment, and the `client/` in its CLI
// tarballs expects to be served by the T3 Code server. This repository builds the hosted app from
// each upstream tag without changing it.
export const webBuildsRepository = "tarik02-org/t3code-web-builds";

export const releaseAssetName = (version: string) => `T3-Code-Web-${version}.zip`;

const archiveRoot = "dist/";

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

  /** Downloads a web build archive and installs it into `target`, replacing what is there. */
  return Effect.fn("installReleaseArchive")(function* (
    release: T3CodeWebReleaseArchive,
    target: string,
  ) {
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}`);

    const archive = yield* client.get(release.url).pipe(
      Effect.flatMap((response) => response.arrayBuffer),
      Effect.map((buffer) => new Uint8Array(buffer)),
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
    if (
      release.sha256 !== null &&
      createHash("sha256").update(archive).digest("hex") !== release.sha256
    ) {
      return yield* failure("The T3 Code Web update did not match its checksum");
    }
    const files = yield* Effect.try({
      try: () => unzipSync(archive),
      catch: () => failure("The T3 Code Web update was not a valid ZIP archive"),
    });

    const install = Effect.gen(function* () {
      yield* fs.remove(temporary, { recursive: true, force: true });
      yield* fs.makeDirectory(temporary, { recursive: true });
      for (const [entry, content] of Object.entries(files)) {
        if (!entry.startsWith(archiveRoot)) {
          return yield* failure("The T3 Code Web update contained an invalid archive layout");
        }
        const relativeEntry = path.normalize(entry.slice(archiveRoot.length));
        if (relativeEntry === "." || entry.endsWith("/")) {
          continue;
        }
        if (path.isAbsolute(relativeEntry) || relativeEntry.split(path.sep).includes("..")) {
          return yield* failure("The T3 Code Web update contained an unsafe path");
        }
        const output = path.join(temporary, relativeEntry);
        yield* fs.makeDirectory(path.dirname(output), { recursive: true });
        yield* fs.writeFile(output, content);
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
