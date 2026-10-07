import * as Context from "effect/Context";
import * as RpcMiddleware from "effect/unstable/rpc/RpcMiddleware";

export class GatewayRequestContext extends Context.Service<
  GatewayRequestContext,
  {
    readonly sessionToken: string | undefined;
    readonly secure: boolean;
    /** The origin the browser reached, as the reverse proxy reports it. */
    readonly origin: string;
  }
>()("@t3code-gateway/contracts/gateway-session/GatewayRequestContext") {}

export class GatewaySessionMiddleware extends RpcMiddleware.Service<
  GatewaySessionMiddleware,
  { provides: GatewayRequestContext }
>()("@t3code-gateway/contracts/gateway-session/GatewaySessionMiddleware") {}
