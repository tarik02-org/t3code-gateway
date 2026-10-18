import type { TraefikConfigResponse } from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { TraefikReconciler } from "../traefik/reconciler.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const traefik = yield* TraefikReconciler;

    yield* router.add("GET", "/api/gateway/traefik/config", () =>
      Effect.gen(function* () {
        const config = yield* traefik.getConfig();
        return yield* HttpServerResponse.json(config satisfies TraefikConfigResponse).pipe(
          Effect.orDie,
        );
      }),
    );
  }),
);
