import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { GatewayRuntimeConfig } from "../config.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const config = yield* GatewayRuntimeConfig;
    const adminStaticRoot = Option.getOrNull(config.adminStaticRoot);
    if (adminStaticRoot === null) {
      return;
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const loginIndexPath = path.join(adminStaticRoot, "login", "index.html");
    const serveLogin = Effect.gen(function* () {
      const html = yield* fs.readFileString(loginIndexPath);
      return HttpServerResponse.text(html, {
        contentType: "text/html; charset=utf-8",
      });
    }).pipe(
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason["_tag"] === "NotFound"
            ? Effect.succeed(HttpServerResponse.text("Not Found", { status: 404 }))
            : Effect.fail(error),
      }),
    );

    yield* router.add("GET", "/admin/login/*", serveLogin);
  }),
);
