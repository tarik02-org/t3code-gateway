import { GatewayRpcs } from "@t3code-gateway/contracts/rpc";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as RpcClient from "effect/rpc/RpcClient";
import type * as RpcClientError from "effect/rpc/RpcClientError";
import * as RpcSerialization from "effect/rpc/RpcSerialization";

type GatewayRpcClient = RpcClient.FromGroup<typeof GatewayRpcs, RpcClientError.RpcClientError>;

const gatewayRpcProtocolLayer = RpcClient.layerProtocolHttp({
  url: "/api/gateway/rpc",
}).pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(RpcSerialization.layerJson));

export const runGatewayRpc = <A, E>(
  run: (client: GatewayRpcClient) => Effect.Effect<A, E, never>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcClient.make(GatewayRpcs);
        return yield* run(client);
      }),
    ).pipe(
      Effect.provide(gatewayRpcProtocolLayer),
      Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }),
    ),
  );
