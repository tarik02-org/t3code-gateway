import * as Http from "node:http";
import { GatewayRpcs } from "@t3code-gateway/contracts/rpc";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpStaticServer from "effect/unstable/http/HttpStaticServer";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

import { AuthService } from "../auth/service.ts";
import { layer as secretEncryptionLayer } from "../crypto/secret-encryption.ts";
import { configLayer, GatewayRuntimeConfig } from "../config.ts";
import { GatewayDatabase, layer as gatewayDatabaseLayer } from "../db/database.ts";
import { layer as authRepositoryLayer } from "../db/auth-repository.ts";
import { layer as environmentRepositoryLayer } from "../db/environment-repository.ts";
import { layer as environmentServiceLayer } from "../environments/service.ts";
import { layer as adminWebRoutesLayer } from "./admin-web-routes.ts";
import { layer as authRoutesLayer } from "./auth-routes.ts";
import { layer as environmentRoutesLayer } from "./environment-routes.ts";
import { layer as gatewaySessionMiddlewareLayer } from "./gateway-session-middleware.ts";
import { layer as rpcHandlersLayer } from "./rpc-handlers.ts";
import { layer as t3codeWebRoutesLayer } from "./t3code-web-routes.ts";
import { layer as traefikRoutesLayer } from "./traefik-routes.ts";
import { sessionGuard } from "./session-guard.ts";
import { layer as authLayer } from "../auth/service.ts";
import { layer as traefikReconcilerLayer, TraefikReconciler } from "../traefik/reconciler.ts";

const foundationLayer = Layer.mergeAll(
  configLayer,
  NodeCrypto.layer,
  NodeHttpServer.layerHttpServices,
  NodeServices.layer,
);

const databaseLiveLayer = gatewayDatabaseLayer.pipe(Layer.provide(foundationLayer));

const authRepositoryLiveLayer = authRepositoryLayer.pipe(Layer.provide(databaseLiveLayer));

const environmentRepositoryLiveLayer = environmentRepositoryLayer.pipe(
  Layer.provide(databaseLiveLayer),
);

const authLiveLayer = authLayer.pipe(
  Layer.provide(authRepositoryLiveLayer),
  Layer.provide(foundationLayer),
);

const secretLiveLayer = secretEncryptionLayer.pipe(Layer.provide(foundationLayer));

const environmentLiveLayer = environmentServiceLayer.pipe(
  Layer.provide(secretLiveLayer),
  Layer.provide(NodeHttpClient.layerFetch),
  Layer.provide(environmentRepositoryLiveLayer),
  Layer.provide(foundationLayer),
);

const traefikLiveLayer = traefikReconcilerLayer.pipe(
  Layer.provide(environmentLiveLayer),
  Layer.provide(foundationLayer),
);

const bootstrapLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const database = yield* GatewayDatabase;
    yield* database.runMigrations;
    const auth = yield* AuthService;
    yield* auth.bootstrapFirstUser();
    const traefik = yield* TraefikReconciler;
    yield* traefik.reconcile();
  }),
).pipe(Layer.provide(traefikLiveLayer), Layer.provide(authLiveLayer));

const gatewayRpcLayer = RpcServer.layerHttp({
  group: GatewayRpcs,
  path: "/api/gateway/rpc",
  protocol: "http",
}).pipe(Layer.provide(rpcHandlersLayer), Layer.provide(RpcSerialization.layerJson));

const routesLayer = Layer.mergeAll(
  adminWebRoutesLayer,
  authRoutesLayer,
  gatewayRpcLayer,
  environmentRoutesLayer,
  t3codeWebRoutesLayer,
  traefikRoutesLayer,
).pipe(
  HttpRouter.provideRequest(configLayer),
  Layer.provideMerge(traefikLiveLayer),
  Layer.provideMerge(environmentLiveLayer),
  Layer.provideMerge(authLiveLayer),
  Layer.provideMerge(environmentRepositoryLiveLayer),
  Layer.provideMerge(authRepositoryLiveLayer),
  Layer.provideMerge(databaseLiveLayer),
  Layer.provideMerge(foundationLayer),
);

const adminStaticLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* GatewayRuntimeConfig;
    const adminStaticRoot = Option.getOrNull(config.adminStaticRoot);
    if (adminStaticRoot === null) {
      return Layer.empty;
    }

    return HttpStaticServer.layer({
      root: adminStaticRoot,
      prefix: "/admin",
      spa: true,
      index: "index.html",
    });
  }),
).pipe(Layer.provide(foundationLayer));

const t3codeWebStaticLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* GatewayRuntimeConfig;
    const t3codeWebStaticRoot = Option.getOrNull(config.t3codeWebStaticRoot);
    if (config.t3codeWebEnabled === false || t3codeWebStaticRoot === null) {
      return Layer.empty;
    }

    return HttpStaticServer.layer({
      root: t3codeWebStaticRoot,
      prefix: "/",
      spa: true,
      index: "index.html",
    });
  }),
).pipe(Layer.provide(foundationLayer));

const gatewayAppLayer = HttpRouter.layer.pipe(
  Layer.provideMerge(t3codeWebStaticLayer),
  Layer.provideMerge(routesLayer),
  Layer.provideMerge(adminStaticLayer),
  Layer.provideMerge(bootstrapLayer),
);

const serverLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* GatewayRuntimeConfig;
    return NodeHttpServer.layer(() => Http.createServer(), {
      host: config.listenHost,
      port: config.listenPort,
    });
  }),
).pipe(Layer.provide(foundationLayer));

const serveLayer = HttpRouter.serve(gatewayAppLayer, {
  middleware: (handler) => sessionGuard(handler).pipe(Effect.orDie),
});

export const runtimeLayer = serveLayer.pipe(
  Layer.provide(serverLayer),
  Layer.provideMerge(foundationLayer),
  Layer.provideMerge(databaseLiveLayer),
  Layer.provideMerge(authRepositoryLiveLayer),
  Layer.provideMerge(environmentRepositoryLiveLayer),
  Layer.provideMerge(authLiveLayer),
  Layer.provideMerge(environmentLiveLayer),
  Layer.provideMerge(traefikLiveLayer),
  Layer.provideMerge(gatewaySessionMiddlewareLayer),
);
