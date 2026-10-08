import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import { GatewayRuntimeConfig } from "../config.ts";
import { McpGrants } from "../mcp/grants.ts";
import { McpRelay, McpRelayError, RELAY_ATTACHMENT_UPLOAD_ROUTE } from "../mcp/relay.ts";
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
    const config = yield* GatewayRuntimeConfig;

    const handler = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      // Stateless: no session to stream server messages on or to end. An SSE stream that closes
      // at once would only make SDK clients reconnect every second.
      if (request.method !== "POST") {
        return HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } });
      }
      const origin = requestOrigin(request.headers, config.publicUrl);

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

    yield* router.add("POST", RELAY_ATTACHMENT_UPLOAD_ROUTE, () =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const callerOrigin = request.headers["origin"];
        if (
          callerOrigin !== undefined &&
          callerOrigin !== requestOrigin(request.headers, config.publicUrl)
        ) {
          return HttpServerResponse.text("Cross-origin requests are not allowed", { status: 403 });
        }
        const params = yield* HttpRouter.params;
        const contentLength = request.headers["content-length"];
        return yield* relay.uploadAttachment(params.slug ?? "", params.token ?? "", {
          body: request.stream,
          contentType: request.headers["content-type"],
          contentLength: contentLength === undefined ? undefined : Number(contentLength),
        });
      }).pipe(
        Effect.catchTag("McpRelayError", (error) =>
          Effect.succeed(HttpServerResponse.text(error.message, { status: 502 })),
        ),
      ),
    );
  }),
);
