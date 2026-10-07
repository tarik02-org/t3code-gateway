import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { McpGrants } from "../mcp/grants.ts";
import { McpRelay, McpRelayError } from "../mcp/relay.ts";
import { requestOrigin } from "./request-origin.ts";

export const MCP_PATH = "/mcp";

const jsonRpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  HttpServerResponse.jsonUnsafe(
    { jsonrpc: "2.0", error: { code: -32_001, message }, id: null },
    { status, headers: { "cache-control": "no-store", ...headers } },
  );

const readBearerToken = (authorization: string | undefined) => {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
};

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const grants = yield* McpGrants;
    const relay = yield* McpRelay;

    const handler = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const origin = requestOrigin(request.headers);

      // Agents call from processes, not pages: a page on another origin must not drive the relay.
      const callerOrigin = request.headers["origin"];
      if (callerOrigin !== undefined && callerOrigin !== origin) {
        return jsonRpcError(403, "Cross-origin requests are not allowed");
      }

      const bearerToken = readBearerToken(request.headers["authorization"]);
      const caller = bearerToken === null ? null : yield* grants.authenticate(bearerToken);
      if (caller === null) {
        return jsonRpcError(401, "A valid T3 Code Gateway MCP credential is required", {
          "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"${
            bearerToken === null ? "" : ', error="invalid_token"'
          }`,
        });
      }

      const webRequest = yield* HttpServerRequest.toWeb(request).pipe(
        Effect.mapError(() => new McpRelayError({ message: "Could not read the request" })),
      );
      const response = yield* relay.handle(webRequest, caller);
      return HttpServerResponse.fromWeb(response);
    }).pipe(
      Effect.catchTags({
        DatabaseError: (error) => Effect.succeed(jsonRpcError(500, error.message)),
        McpRelayError: (error) => Effect.succeed(jsonRpcError(500, error.message)),
      }),
    );

    yield* router.add("*", MCP_PATH, handler);
  }),
);
