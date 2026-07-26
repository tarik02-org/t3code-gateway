import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { GatewayRuntimeConfig } from "../config.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const config = yield* GatewayRuntimeConfig;
    const t3codeWebStaticRoot = Option.getOrNull(config.t3codeWebStaticRoot);
    if (config.t3codeWebEnabled === false || t3codeWebStaticRoot === null) {
      yield* router.add("GET", "/", () =>
        Effect.succeed(
          HttpServerResponse.redirect("/admin", {
            status: 302,
            headers: { "cache-control": "no-store" },
          }),
        ),
      );
      return;
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const indexPath = path.join(t3codeWebStaticRoot, "index.html");

    yield* router.add("GET", "/", () =>
      Effect.gen(function* () {
        const html = yield* fs.readFileString(indexPath);
        return HttpServerResponse.text(html, {
          contentType: "text/html; charset=utf-8",
        });
      }).pipe(
        Effect.catchTags({
          PlatformError: (error) =>
            error.reason["_tag"] === "NotFound"
              ? Effect.succeed(
                  HttpServerResponse.redirect("/admin", {
                    status: 302,
                    headers: { "cache-control": "no-store" },
                  }),
                )
              : Effect.fail(error),
        }),
      ),
    );
  }),
);
