import { McpAuthorizationRequest } from "@t3code-gateway/contracts/schemas";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import {
  authorizationServerMetadata,
  McpClientRegistration,
  McpOAuth,
  mcpOAuthUrls,
  McpTokenRequest,
  McpTokenRevocation,
  protectedResourceMetadata,
  redirectForError,
} from "../mcp/oauth.ts";
import { requestOrigin } from "./request-origin.ts";

/** Where `/oauth/authorize` sends the browser for the signed-in user's consent. */
const CONSENT_PAGE_PATH = "/admin/connect";

// Browser-based MCP clients read metadata and exchange codes cross-origin; none of it uses cookies.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
};

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  HttpServerResponse.jsonUnsafe(body, { status, headers: { ...CORS_HEADERS, ...headers } });

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const errorPage = (description: string) =>
  HttpServerResponse.text(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign-in failed</title></head><body style="font-family:system-ui;margin:3rem auto;max-width:32rem"><h1>Sign-in failed</h1><p>${escapeHtml(description)}</p></body></html>`,
    {
      status: 400,
      contentType: "text/html; charset=utf-8",
      headers: {
        ...NO_STORE,
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        "x-frame-options": "DENY",
      },
    },
  );

const urlsFor = (request: HttpServerRequest.HttpServerRequest) =>
  mcpOAuthUrls(requestOrigin(request.headers));

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const oauth = yield* McpOAuth;

    const preflight = HttpServerResponse.empty({ status: 204, headers: CORS_HEADERS });
    const metadata = (build: (urls: ReturnType<typeof mcpOAuthUrls>) => unknown) =>
      Effect.map(HttpServerRequest.HttpServerRequest, (request) => json(build(urlsFor(request))));

    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ] as const) {
      yield* router.add("GET", path, metadata(protectedResourceMetadata));
      yield* router.add("OPTIONS", path, preflight);
    }
    yield* router.add(
      "GET",
      "/.well-known/oauth-authorization-server",
      metadata(authorizationServerMetadata),
    );
    yield* router.add("OPTIONS", "/.well-known/oauth-authorization-server", preflight);

    yield* router.add(
      "POST",
      "/oauth/register",
      HttpServerRequest.schemaBodyJson(McpClientRegistration).pipe(
        Effect.flatMap(oauth.register),
        Effect.zip(DateTime.now),
        Effect.map(([client, issuedAt]) =>
          json(
            {
              client_id: client.clientId,
              client_id_issued_at: Math.floor(DateTime.toEpochMillis(issuedAt) / 1_000),
              client_name: client.name,
              redirect_uris: client.redirectUris,
              grant_types: ["authorization_code", "refresh_token"],
              response_types: ["code"],
              token_endpoint_auth_method: "none",
            },
            201,
            NO_STORE,
          ),
        ),
        Effect.catchTags({
          McpOAuthRegistrationError: (error) =>
            Effect.succeed(
              json({ error: error.error, error_description: error.description }, 400, NO_STORE),
            ),
          SchemaError: () =>
            Effect.succeed(
              json(
                {
                  error: "invalid_client_metadata",
                  error_description: "Malformed client metadata",
                },
                400,
                NO_STORE,
              ),
            ),
          HttpServerError: () =>
            Effect.succeed(
              json({ error: "invalid_client_metadata", error_description: "Unreadable body" }, 400),
            ),
          DatabaseError: (error) =>
            Effect.succeed(json({ error: "server_error", error_description: error.message }, 500)),
        }),
      ),
    );
    yield* router.add("OPTIONS", "/oauth/register", preflight);

    // The browser lands here from the agent; a valid request continues to the consent page.
    yield* router.add("GET", "/oauth/authorize", (request) =>
      Effect.gen(function* () {
        const urls = urlsFor(request);
        const query = new URL(request.url, urls.issuer).search;
        const params = yield* HttpServerRequest.schemaSearchParams(McpAuthorizationRequest);
        return yield* oauth.validateAuthorization(urls, params).pipe(
          Effect.as(
            HttpServerResponse.redirect(`${CONSENT_PAGE_PATH}${query}`, { headers: NO_STORE }),
          ),
          Effect.catchTags({
            McpOAuthPageError: (error) => Effect.succeed(errorPage(error.description)),
            McpOAuthRedirectError: (error) =>
              Effect.succeed(
                HttpServerResponse.redirect(redirectForError(error, urls), { headers: NO_STORE }),
              ),
          }),
        );
      }).pipe(
        Effect.catchTags({
          SchemaError: () => Effect.succeed(errorPage("The sign-in request is malformed.")),
        }),
      ),
    );

    yield* router.add("POST", "/oauth/token", (request) =>
      HttpServerRequest.schemaBodyUrlParams(McpTokenRequest).pipe(
        Effect.flatMap((payload) => oauth.exchange(urlsFor(request), payload)),
        Effect.map((tokens) => json(tokens, 200, NO_STORE)),
        Effect.catchTags({
          McpOAuthTokenError: (error) =>
            Effect.succeed(
              json(
                { error: error.error, error_description: error.description },
                error.error === "invalid_client" ? 401 : 400,
                NO_STORE,
              ),
            ),
          SchemaError: () =>
            Effect.succeed(
              json({ error: "invalid_request", error_description: "Malformed token request" }, 400),
            ),
          HttpServerError: () =>
            Effect.succeed(
              json({ error: "invalid_request", error_description: "Unreadable body" }, 400),
            ),
          DatabaseError: (error) =>
            Effect.succeed(json({ error: "server_error", error_description: error.message }, 500)),
        }),
      ),
    );
    yield* router.add("OPTIONS", "/oauth/token", preflight);

    yield* router.add(
      "POST",
      "/oauth/revoke",
      HttpServerRequest.schemaBodyUrlParams(McpTokenRevocation).pipe(
        Effect.flatMap((payload) =>
          payload.token === undefined ? Effect.void : oauth.revoke(payload.token),
        ),
        // RFC 7009 §2.2: unknown tokens are not an error.
        Effect.as(json({}, 200, NO_STORE)),
        Effect.catchTags({
          SchemaError: () => Effect.succeed(json({ error: "invalid_request" }, 400)),
          HttpServerError: () => Effect.succeed(json({ error: "invalid_request" }, 400)),
          DatabaseError: (error) =>
            Effect.succeed(json({ error: "server_error", error_description: error.message }, 500)),
        }),
      ),
    );
    yield* router.add("OPTIONS", "/oauth/revoke", preflight);
  }),
);
