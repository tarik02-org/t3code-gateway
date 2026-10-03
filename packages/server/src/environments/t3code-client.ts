import type {
  EnvironmentClientSession,
  EnvironmentMcpStatus,
  RevokeEnvironmentClientResponse,
} from "@t3code-gateway/contracts/schemas";
import { EnvironmentFailure } from "@t3code-gateway/contracts/schemas";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as HttpBody from "effect/unstable/http/HttpBody";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import type * as HttpClientError from "effect/unstable/http/HttpClientError";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Schema from "effect/Schema";

import { GATEWAY_VERSION } from "../version.ts";
import { joinBaseUrl } from "./urls.ts";

const ENVIRONMENT_DESCRIPTOR_PATH = "/.well-known/t3/environment";
const OAUTH_TOKEN_PATH = "/oauth/token";
const CLIENTS_PATH = "/api/auth/clients";
const CLIENTS_REVOKE_PATH = "/api/auth/clients/revoke";
const PAIRING_TOKEN_PATH = "/api/auth/pairing-token";
const MCP_PATH = "/mcp";
const MCP_PROTOCOL_VERSION = "2025-06-18";
// T3 Code marks the tools that serve callers outside T3 Code with this `_meta` key.
const EXTERNAL_CALLER_TOOL_META_KEY = "t3code/externalCaller";

const EnvironmentClientMetadataDeviceType = Schema.Literals([
  "desktop",
  "mobile",
  "tablet",
  "bot",
  "unknown",
]);

const T3ClientSession = Schema.Struct({
  sessionId: Schema.String,
  subject: Schema.String,
  scopes: Schema.Array(Schema.String),
  method: Schema.Literals(["browser-session-cookie", "bearer-access-token", "dpop-access-token"]),
  client: Schema.Struct({
    label: Schema.optional(Schema.String),
    ipAddress: Schema.optional(Schema.String),
    userAgent: Schema.optional(Schema.String),
    deviceType: EnvironmentClientMetadataDeviceType,
    os: Schema.optional(Schema.String),
    browser: Schema.optional(Schema.String),
  }),
  issuedAt: Schema.String,
  expiresAt: Schema.DateTimeUtcFromString,
  lastConnectedAt: Schema.NullOr(Schema.String),
  connected: Schema.Boolean,
  current: Schema.Boolean,
});

const T3ClientSessionList = Schema.Array(T3ClientSession);

const T3ClientSessionRevokeResult = Schema.Struct({
  revoked: Schema.Boolean,
});

const T3AccessTokenResult = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.Literals(["Bearer", "DPoP"]),
  expires_in: Schema.Number,
});

const T3PairingCredentialResult = Schema.Struct({
  credential: Schema.String,
});

const environmentHttpClientFailureMessage = (
  action: string,
  url: string,
  error: HttpClientError.HttpClientError,
) => {
  switch (error.reason["_tag"]) {
    case "DecodeError":
      return `Could not ${action} at ${url}: response decoding failed`;
    case "EmptyBodyError":
      return `Could not ${action} at ${url}: response body was empty`;
    case "EncodeError":
      return `Could not ${action} at ${url}: request encoding failed`;
    case "InvalidUrlError":
      return `Could not ${action} at ${url}: invalid URL`;
    case "StatusCodeError":
      return `Could not ${action} at ${url}: unexpected HTTP status ${error.reason.response.status}`;
    case "TransportError":
      return `Could not ${action} at ${url}: transport failed`;
  }
};

const responseBodyFailureMessage = (error: HttpClientError.HttpClientError) => {
  switch (error.reason["_tag"]) {
    case "DecodeError":
      return "Failed to read response body: response decoding failed";
    case "EmptyBodyError":
      return "Failed to read response body: response body was empty";
    case "EncodeError":
      return "Failed to read response body: request encoding failed";
    case "InvalidUrlError":
      return "Failed to read response body: invalid URL";
    case "StatusCodeError":
      return `Failed to read response body: unexpected HTTP status ${error.reason.response.status}`;
    case "TransportError":
      return "Failed to read response body: transport failed";
  }
};

const readJsonBody = (body: string) =>
  Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(body).pipe(
    Effect.catchTags({
      SchemaError: () =>
        Effect.fail(new EnvironmentFailure({ message: "Environment returned invalid JSON" })),
    }),
  );

const readResponseText = (response: HttpClientResponse.HttpClientResponse) =>
  response.text.pipe(
    Effect.catchTags({
      HttpClientError: (error) =>
        Effect.fail(new EnvironmentFailure({ message: responseBodyFailureMessage(error) })),
    }),
  );

export const fetchEnvironmentDescriptor = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, ENVIRONMENT_DESCRIPTOR_PATH);
    const response = yield* client.get(url).pipe(
      Effect.catchTags({
        HttpClientError: (error) =>
          Effect.fail(
            new EnvironmentFailure({
              message: environmentHttpClientFailureMessage(
                "reach environment descriptor",
                url,
                error,
              ),
            }),
          ),
      }),
    );

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Environment descriptor request failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    return yield* readJsonBody(body);
  });

export const validateAdminBearerToken = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
) =>
  listClientSessions(client, internalHttpBaseUrl, adminBearerToken).pipe(
    Effect.flatMap((sessions) => {
      const current = sessions.find((session) => session.current);
      return current === undefined
        ? Effect.fail(
            new EnvironmentFailure({
              message: "Environment did not identify the current admin token session",
            }),
          )
        : Effect.succeed(current);
    }),
  );

export const exchangePairingCodeForBearerToken = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  pairingCode: string,
  scopes: ReadonlyArray<string>,
) =>
  exchangePairingCodeForBearerAccessToken(client, internalHttpBaseUrl, pairingCode, scopes).pipe(
    Effect.map((token) => token.accessToken),
  );

export const exchangePairingCodeForBearerAccessToken = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  pairingCode: string,
  scopes: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, OAUTH_TOKEN_PATH);
    const response = yield* client
      .post(url, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: HttpBody.text(
          new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
            subject_token: pairingCode,
            subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
            requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
            scope: scopes.join(" "),
            client_label: "gateway",
            client_device_type: "bot",
          }).toString(),
          "application/x-www-form-urlencoded",
        ),
      })
      .pipe(
        Effect.catchTags({
          HttpClientError: (error) =>
            Effect.fail(
              new EnvironmentFailure({
                message: environmentHttpClientFailureMessage("exchange pairing code", url, error),
              }),
            ),
        }),
      );

    if (response.status === 401 || response.status === 403) {
      return yield* new EnvironmentFailure({
        message: "Pairing code was rejected by the environment",
        status: response.status,
      });
    }

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Pairing code exchange failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    const parsed = yield* readJsonBody(body);
    const token = yield* Schema.decodeUnknownEffect(T3AccessTokenResult)(parsed).pipe(
      Effect.catchTags({
        SchemaError: () =>
          Effect.fail(
            new EnvironmentFailure({ message: "Environment returned an invalid access token" }),
          ),
      }),
    );

    if (token.token_type !== "Bearer") {
      return yield* new EnvironmentFailure({
        message: "Environment did not return a bearer token",
      });
    }

    return {
      accessToken: token.access_token,
      expiresInSeconds: token.expires_in,
    };
  });

export const createPairingCredential = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
  input: { readonly label: string; readonly scopes: ReadonlyArray<string> },
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, PAIRING_TOKEN_PATH);
    const response = yield* client
      .post(url, {
        headers: {
          ...bearerAuthHeaders(adminBearerToken),
          "content-type": "application/json",
        },
        body: HttpBody.jsonUnsafe(input),
      })
      .pipe(
        Effect.catchTags({
          HttpClientError: (error) =>
            Effect.fail(
              new EnvironmentFailure({
                message: environmentHttpClientFailureMessage(
                  "create pairing credential",
                  url,
                  error,
                ),
              }),
            ),
        }),
      );

    if (response.status === 401 || response.status === 403) {
      return yield* new EnvironmentFailure({
        message: "Admin bearer token was rejected by the environment",
        status: response.status,
      });
    }

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Pairing credential creation failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    const parsed = yield* readJsonBody(body);
    const credential = yield* Schema.decodeUnknownEffect(T3PairingCredentialResult)(parsed).pipe(
      Effect.catchTags({
        SchemaError: () =>
          Effect.fail(
            new EnvironmentFailure({
              message: "Environment returned an invalid pairing credential",
            }),
          ),
      }),
    );

    return credential.credential;
  });

export const createBearerTokenForClient = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
  input: { readonly label: string; readonly scopes: ReadonlyArray<string> },
) =>
  Effect.gen(function* () {
    const credential = yield* createPairingCredential(
      client,
      internalHttpBaseUrl,
      adminBearerToken,
      input,
    );
    return yield* exchangePairingCodeForBearerAccessToken(
      client,
      internalHttpBaseUrl,
      credential,
      input.scopes,
    );
  });

const bearerAuthHeaders = (adminBearerToken: string) => ({
  authorization: `Bearer ${adminBearerToken}`,
});

const mapClientSession = (session: typeof T3ClientSession.Type): EnvironmentClientSession => ({
  sessionId: session.sessionId,
  subject: session.subject,
  scopes: session.scopes,
  method: session.method,
  client: session.client,
  issuedAt: session.issuedAt,
  expiresAt: DateTime.formatIso(session.expiresAt),
  lastConnectedAt: session.lastConnectedAt,
  connected: session.connected,
  current: session.current,
});

const decodeClientSessions = (body: unknown) =>
  Schema.decodeUnknownEffect(T3ClientSessionList)(body).pipe(
    Effect.catchTags({
      SchemaError: () =>
        Effect.fail(
          new EnvironmentFailure({ message: "Environment returned invalid client sessions" }),
        ),
    }),
  );

const decodeClientSessionRevokeResult = (body: unknown) =>
  Schema.decodeUnknownEffect(T3ClientSessionRevokeResult)(body).pipe(
    Effect.catchTags({
      SchemaError: () =>
        Effect.fail(
          new EnvironmentFailure({ message: "Environment returned an invalid revoke response" }),
        ),
    }),
  );

export const listClientSessions = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, CLIENTS_PATH);
    const response = yield* client
      .get(url, {
        headers: bearerAuthHeaders(adminBearerToken),
      })
      .pipe(
        Effect.catchTags({
          HttpClientError: (error) =>
            Effect.fail(
              new EnvironmentFailure({
                message: environmentHttpClientFailureMessage("list client sessions", url, error),
              }),
            ),
        }),
      );

    if (response.status === 401 || response.status === 403) {
      return yield* new EnvironmentFailure({
        message: "Admin bearer token was rejected by the environment",
        status: response.status,
      });
    }

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Client session list failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    const parsed = yield* readJsonBody(body);
    const sessions = yield* decodeClientSessions(parsed);
    return sessions.map(mapClientSession);
  });

export const revokeClientSession = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
  sessionId: string,
) =>
  Effect.gen(function* () {
    const url = joinBaseUrl(internalHttpBaseUrl, CLIENTS_REVOKE_PATH);
    const response = yield* client
      .post(url, {
        headers: {
          ...bearerAuthHeaders(adminBearerToken),
          "content-type": "application/json",
        },
        body: HttpBody.jsonUnsafe({ sessionId }),
      })
      .pipe(
        Effect.catchTags({
          HttpClientError: (error) =>
            Effect.fail(
              new EnvironmentFailure({
                message: environmentHttpClientFailureMessage("revoke client session", url, error),
              }),
            ),
        }),
      );

    if (response.status === 401) {
      return yield* new EnvironmentFailure({
        message: "Admin bearer token was rejected by the environment",
      });
    }

    if (response.status === 403) {
      return yield* new EnvironmentFailure({
        message: "Client session revoke was refused by the environment",
      });
    }

    if (response.status === 404) {
      return yield* new EnvironmentFailure({ message: "Client session was not found" });
    }

    if (response.status !== 200) {
      return yield* new EnvironmentFailure({
        message: `Client session revoke failed with status ${response.status}`,
      });
    }

    const body = yield* readResponseText(response);
    const parsed = yield* readJsonBody(body);
    const result = yield* decodeClientSessionRevokeResult(parsed);
    return result satisfies RevokeEnvironmentClientResponse;
  });

export const readEnvironmentId = (descriptor: unknown) => {
  if (
    typeof descriptor !== "object" ||
    descriptor === null ||
    !("environmentId" in descriptor) ||
    typeof descriptor.environmentId !== "string" ||
    descriptor.environmentId.length === 0
  ) {
    return null;
  }

  return descriptor.environmentId;
};

export const readEnvironmentLabel = (descriptor: unknown) => {
  if (
    typeof descriptor !== "object" ||
    descriptor === null ||
    !("label" in descriptor) ||
    typeof descriptor.label !== "string" ||
    descriptor.label.length === 0
  ) {
    return null;
  }

  return descriptor.label;
};

const McpToolsListResponse = Schema.Struct({
  result: Schema.Struct({
    tools: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        meta: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
      }).pipe(Schema.encodeKeys({ meta: "_meta" })),
    ),
    nextCursor: Schema.optional(Schema.String),
  }),
});

const decodeMcpToolsListResponse = Schema.decodeUnknownEffect(
  Schema.fromJsonString(McpToolsListResponse),
);

/** A JSON-RPC reply arrives as plain JSON or as the last `data:` line of an event stream. */
const mcpReplyText = (response: HttpClientResponse.HttpClientResponse, body: string) => {
  if (!(response.headers["content-type"] ?? "").includes("text/event-stream")) {
    return body;
  }
  const dataLines = body.split("\n").filter((line) => line.startsWith("data:"));
  return dataLines.at(-1)?.slice("data:".length).trim() ?? "";
};

const mcpUnavailable = (message: string): EnvironmentMcpStatus => ({
  _tag: "Unavailable",
  message,
});

/**
 * Opens an MCP session on the environment with the gateway's admin token and
 * counts the tools that serve external callers. Older T3 Code builds accept
 * only their own agents' credentials on `/mcp` and answer 401.
 */
export const probeExternalMcp = (
  client: HttpClient.HttpClient,
  internalHttpBaseUrl: string,
  adminBearerToken: string,
): Effect.Effect<EnvironmentMcpStatus> => {
  const url = joinBaseUrl(internalHttpBaseUrl, MCP_PATH);
  const post = (headers: Record<string, string>, message: unknown) =>
    client.post(url, {
      headers: {
        ...bearerAuthHeaders(adminBearerToken),
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...headers,
      },
      body: HttpBody.jsonUnsafe(message),
    });

  const listExternalTools = (sessionHeaders: Record<string, string>) =>
    Effect.gen(function* () {
      let count = 0;
      let cursor: string | undefined;
      let requestId = 2;
      do {
        const response = yield* post(sessionHeaders, {
          jsonrpc: "2.0",
          id: requestId++,
          method: "tools/list",
          params: cursor === undefined ? {} : { cursor },
        });
        if (response.status !== 200) {
          return yield* new EnvironmentFailure({
            message: `MCP tool listing failed with status ${response.status}`,
          });
        }
        const reply = yield* decodeMcpToolsListResponse(
          mcpReplyText(response, yield* readResponseText(response)),
        ).pipe(
          Effect.catchTags({
            SchemaError: () =>
              Effect.fail(
                new EnvironmentFailure({ message: "Environment returned an invalid tool list" }),
              ),
          }),
        );
        count += reply.result.tools.filter(
          (tool) => tool.meta?.[EXTERNAL_CALLER_TOOL_META_KEY] === true,
        ).length;
        cursor = reply.result.nextCursor;
      } while (cursor !== undefined);
      return count;
    });

  return Effect.gen(function* () {
    const initialized = yield* post(
      {},
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "t3code-gateway", version: GATEWAY_VERSION },
        },
      },
    );
    switch (initialized.status) {
      case 200:
        break;
      case 401:
        // A token the environment accepts elsewhere means /mcp only serves T3 Code's own agents.
        yield* listClientSessions(client, internalHttpBaseUrl, adminBearerToken);
        return {
          _tag: "Unsupported",
          message: "This T3 Code version accepts only its own agents on its MCP endpoint.",
        } satisfies EnvironmentMcpStatus;
      case 404:
        return {
          _tag: "Unsupported",
          message: "This T3 Code version has no MCP endpoint.",
        } satisfies EnvironmentMcpStatus;
      case 403:
        return mcpUnavailable("The admin token does not grant orchestration:operate.");
      default:
        return mcpUnavailable(`MCP initialization failed with status ${initialized.status}`);
    }

    const sessionId = initialized.headers["mcp-session-id"];
    const sessionHeaders: Record<string, string> = {
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      ...(sessionId === undefined ? {} : { "mcp-session-id": sessionId }),
    };
    const closeSession =
      sessionId === undefined
        ? Effect.void
        : client
            .del(url, { headers: { ...bearerAuthHeaders(adminBearerToken), ...sessionHeaders } })
            .pipe(Effect.ignore);

    return yield* Effect.gen(function* () {
      yield* post(sessionHeaders, { jsonrpc: "2.0", method: "notifications/initialized" });
      const externalToolCount = yield* listExternalTools(sessionHeaders);
      return { _tag: "Supported", externalToolCount } satisfies EnvironmentMcpStatus;
    }).pipe(Effect.ensuring(closeSession));
  }).pipe(
    Effect.catchTags({
      HttpClientError: (error) =>
        Effect.succeed(
          mcpUnavailable(environmentHttpClientFailureMessage("probe MCP endpoint", url, error)),
        ),
      EnvironmentFailure: (error) => Effect.succeed(mcpUnavailable(error.message)),
    }),
  );
};
