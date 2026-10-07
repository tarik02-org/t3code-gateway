import type {
  McpAuthorizationDecision,
  McpAuthorizationRequest,
} from "@t3code-gateway/contracts/schemas";
import type { McpFailure } from "@t3code-gateway/contracts/schemas";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Layer from "effect/Layer";
import type * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { hashSessionToken } from "../auth/session.ts";
import { SecretEncryption } from "../crypto/secret-encryption.ts";
import { DatabaseError } from "../db/errors.ts";
import { McpGrantRepository, type McpGrantRow } from "../db/mcp-grant-repository.ts";
import { createBearerToken, McpGrants } from "./grants.ts";

const CLIENT_ID_PREFIX = "gwc_";
const SCOPE = "mcp";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_DAYS = 90;
const AUTHORIZATION_CODE_TTL = "1 minute";
const MAX_REDIRECT_URIS = 10;
const MAX_CLIENT_NAME_LENGTH = 100;
const CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
// Schemes a redirect may never use: they run code or read local files instead of reaching an app.
const FORBIDDEN_REDIRECT_SCHEMES = new Set([
  "javascript:",
  "data:",
  "file:",
  "blob:",
  "about:",
  "vbscript:",
]);

/** Issuer and resource for the origin a request reached. */
export interface McpOAuthUrls {
  readonly issuer: string;
  readonly resource: string;
}

export const mcpOAuthUrls = (origin: string): McpOAuthUrls => ({
  issuer: origin,
  resource: `${origin}/mcp`,
});

export const protectedResourceMetadata = (urls: McpOAuthUrls) => ({
  resource: urls.resource,
  authorization_servers: [urls.issuer],
  scopes_supported: [SCOPE],
  bearer_methods_supported: ["header"],
  resource_name: "T3 Code Gateway",
});

export const authorizationServerMetadata = (urls: McpOAuthUrls) => ({
  issuer: urls.issuer,
  authorization_endpoint: `${urls.issuer}/oauth/authorize`,
  token_endpoint: `${urls.issuer}/oauth/token`,
  registration_endpoint: `${urls.issuer}/oauth/register`,
  revocation_endpoint: `${urls.issuer}/oauth/revoke`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  revocation_endpoint_auth_methods_supported: ["none"],
  scopes_supported: [SCOPE],
  authorization_response_iss_parameter_supported: true,
});

/** A request naming an unknown client or redirect: shown to the user, never redirected. */
export class McpOAuthPageError extends Schema.TaggedErrorClass<McpOAuthPageError>()(
  "McpOAuthPageError",
  { description: Schema.String },
) {}

/** A protocol error the client receives through its verified redirect. */
export class McpOAuthRedirectError extends Schema.TaggedErrorClass<McpOAuthRedirectError>()(
  "McpOAuthRedirectError",
  {
    redirectUri: Schema.String,
    state: Schema.optionalKey(Schema.String),
    error: Schema.Literals(["invalid_request", "unsupported_response_type", "invalid_target"]),
    description: Schema.String,
  },
) {}

/** RFC 7591 §3.2.2. */
export class McpOAuthRegistrationError extends Schema.TaggedErrorClass<McpOAuthRegistrationError>()(
  "McpOAuthRegistrationError",
  {
    error: Schema.Literals(["invalid_client_metadata", "invalid_redirect_uri"]),
    description: Schema.String,
  },
) {}

/** RFC 6749 §5.2. */
export class McpOAuthTokenError extends Schema.TaggedErrorClass<McpOAuthTokenError>()(
  "McpOAuthTokenError",
  {
    error: Schema.Literals([
      "invalid_request",
      "invalid_client",
      "invalid_grant",
      "unsupported_grant_type",
    ]),
    description: Schema.String,
  },
) {}

export const McpClientRegistration = Schema.Struct({
  client_name: Schema.optionalKey(Schema.String),
  redirect_uris: Schema.optionalKey(Schema.Array(Schema.String)),
  token_endpoint_auth_method: Schema.optionalKey(Schema.String),
});

export type McpClientRegistration = typeof McpClientRegistration.Type;

export const McpTokenRequest = Schema.Struct({
  grant_type: Schema.optionalKey(Schema.String),
  code: Schema.optionalKey(Schema.String),
  redirect_uri: Schema.optionalKey(Schema.String),
  client_id: Schema.optionalKey(Schema.String),
  code_verifier: Schema.optionalKey(Schema.String),
  refresh_token: Schema.optionalKey(Schema.String),
  resource: Schema.optionalKey(Schema.String),
});

export type McpTokenRequest = typeof McpTokenRequest.Type;

export const McpTokenRevocation = Schema.Struct({
  token: Schema.optionalKey(Schema.String),
  token_type_hint: Schema.optionalKey(Schema.String),
});

// Registration is stateless: the client id carries its own metadata, sealed with the gateway key.
const RegisteredClient = Schema.fromJsonString(
  Schema.Struct({
    v: Schema.Literal(1),
    name: Schema.String,
    redirectUris: Schema.Array(Schema.String),
  }),
);
const encodeRegisteredClient = Schema.encodeSync(RegisteredClient);
const decodeRegisteredClient = Schema.decodeUnknownResult(RegisteredClient);

interface RegisteredMcpClient {
  readonly clientId: string;
  readonly name: string;
  readonly redirectUris: ReadonlyArray<string>;
}

/** A checked authorization request. */
export interface McpAuthorization {
  readonly client: RegisteredMcpClient;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly state: string | undefined;
}

interface PendingCode {
  readonly authorization: McpAuthorization;
  readonly resource: string;
  readonly grant: {
    readonly label: string;
    readonly access: McpGrantRow["access"];
    readonly environmentIdsJson: string | null;
  };
  readonly approvedByUserId: string | null;
  readonly expiresAt: DateTime.Utc;
}

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

const redirectUriProblem = (value: string) => {
  const url = URL.parse(value);
  if (url === null) {
    return "is not a URL";
  }
  if (url.hash !== "") {
    return "has a fragment";
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    return "uses http on a host other than loopback";
  }
  if (FORBIDDEN_REDIRECT_SCHEMES.has(url.protocol)) {
    return `uses the ${url.protocol} scheme`;
  }
  return null;
};

/** RFC 8252 §7.3: a native app's loopback redirect may use any port. */
const redirectMatches = (registered: string, requested: string) => {
  if (registered === requested) {
    return true;
  }
  const left = URL.parse(registered);
  const right = URL.parse(requested);
  if (
    left === null ||
    right === null ||
    left.protocol !== "http:" ||
    !isLoopbackHost(left.hostname)
  ) {
    return false;
  }
  left.port = "";
  right.port = "";
  return left.href === right.href;
};

const sameResource = (left: string, right: string) =>
  left.replace(/\/+$/, "") === right.replace(/\/+$/, "");

const redirectTo = (redirectUri: string, params: Record<string, string | undefined>) => {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.href;
};

export const redirectForError = (error: McpOAuthRedirectError, urls: McpOAuthUrls) =>
  redirectTo(error.redirectUri, {
    error: error.error,
    error_description: error.description,
    state: error.state,
    iss: urls.issuer,
  });

const platformFailure = (error: PlatformError.PlatformError) =>
  Effect.fail(new DatabaseError({ operation: "mcpGrant", reason: "unknown", cause: error }));

export class McpOAuth extends Context.Service<
  McpOAuth,
  {
    readonly register: (
      registration: McpClientRegistration,
    ) => Effect.Effect<RegisteredMcpClient, McpOAuthRegistrationError | DatabaseError>;
    readonly validateAuthorization: (
      urls: McpOAuthUrls,
      request: McpAuthorizationRequest,
    ) => Effect.Effect<McpAuthorization, McpOAuthPageError | McpOAuthRedirectError>;
    /** Records the signed-in user's decision and returns where the browser goes next. */
    readonly decide: (input: {
      readonly urls: McpOAuthUrls;
      readonly authorization: McpAuthorization;
      readonly decision: McpAuthorizationDecision;
      readonly userId: string | null;
    }) => Effect.Effect<string, McpFailure | DatabaseError>;
    readonly exchange: (
      urls: McpOAuthUrls,
      request: McpTokenRequest,
    ) => Effect.Effect<
      {
        readonly access_token: string;
        readonly token_type: "Bearer";
        readonly expires_in: number;
        readonly refresh_token: string;
        readonly scope: string;
      },
      McpOAuthTokenError | DatabaseError
    >;
    /** RFC 7009: forgets the token if the gateway knows it. */
    readonly revoke: (token: string) => Effect.Effect<void, DatabaseError>;
  }
>()("@t3code-gateway/server/mcp/oauth/McpOAuth") {}

export const make = Effect.gen(function* () {
  const secrets = yield* SecretEncryption;
  const grants = yield* McpGrants;
  const grantRepository = yield* McpGrantRepository;
  const crypto = yield* Crypto.Crypto;
  const pendingCodes = new Map<string, PendingCode>();

  const sealFailure = Effect.mapError(
    (error: { readonly message: string }) =>
      new DatabaseError({ operation: "mcpGrant", reason: "unknown", cause: error }),
  );

  const register = (registration: McpClientRegistration) =>
    Effect.gen(function* () {
      // RFC 7591 §3.2.1 lets the server replace requested metadata: every client is public here,
      // and the response tells it so with token_endpoint_auth_method "none".
      const redirectUris = [...new Set(registration.redirect_uris ?? [])];
      if (redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
        return yield* new McpOAuthRegistrationError({
          error: "invalid_redirect_uri",
          description: `Register 1 to ${MAX_REDIRECT_URIS} redirect URIs`,
        });
      }
      for (const redirectUri of redirectUris) {
        const problem = redirectUriProblem(redirectUri);
        if (problem !== null) {
          return yield* new McpOAuthRegistrationError({
            error: "invalid_redirect_uri",
            description: `Redirect URI ${redirectUri} ${problem}`,
          });
        }
      }
      const name =
        registration.client_name?.trim().slice(0, MAX_CLIENT_NAME_LENGTH) || "MCP client";
      const sealed = yield* secrets
        .encrypt(encodeRegisteredClient({ v: 1, name, redirectUris }))
        .pipe(sealFailure);
      return {
        clientId: `${CLIENT_ID_PREFIX}${Encoding.encodeBase64Url(sealed)}`,
        name,
        redirectUris,
      } satisfies RegisteredMcpClient;
    });

  const readClient = (clientId: string | undefined) =>
    Effect.gen(function* () {
      if (clientId === undefined || !clientId.startsWith(CLIENT_ID_PREFIX)) {
        return null;
      }
      const sealed = Encoding.decodeBase64Url(clientId.slice(CLIENT_ID_PREFIX.length));
      if (Result.isFailure(sealed)) {
        return null;
      }
      const opened = yield* secrets.decrypt(Buffer.from(sealed.success)).pipe(Effect.result);
      if (Result.isFailure(opened)) {
        return null;
      }
      const decoded = decodeRegisteredClient(opened.success);
      if (Result.isFailure(decoded)) {
        return null;
      }
      return {
        clientId,
        name: decoded.success.name,
        redirectUris: decoded.success.redirectUris,
      } satisfies RegisteredMcpClient;
    });

  const validateAuthorization = (urls: McpOAuthUrls, request: McpAuthorizationRequest) =>
    Effect.gen(function* () {
      const client = yield* readClient(request.client_id);
      if (client === null) {
        return yield* new McpOAuthPageError({
          description: "The application is not registered with this gateway.",
        });
      }
      const redirectUri =
        request.redirect_uri ??
        (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
      if (
        redirectUri === undefined ||
        !client.redirectUris.some((registered) => redirectMatches(registered, redirectUri))
      ) {
        return yield* new McpOAuthPageError({
          description: "The application asked to return to an address it did not register.",
        });
      }

      const fail = (
        error: McpOAuthRedirectError["error"],
        description: string,
      ): Effect.Effect<never, McpOAuthRedirectError> =>
        Effect.fail(
          new McpOAuthRedirectError({
            redirectUri,
            ...(request.state === undefined ? {} : { state: request.state }),
            error,
            description,
          }),
        );
      if (request.response_type !== "code") {
        return yield* fail("unsupported_response_type", "Only the code response type is supported");
      }
      if (
        request.code_challenge_method !== "S256" ||
        request.code_challenge === undefined ||
        !CODE_CHALLENGE.test(request.code_challenge)
      ) {
        return yield* fail("invalid_request", "A PKCE S256 code challenge is required");
      }
      if (request.resource !== undefined && !sameResource(request.resource, urls.resource)) {
        return yield* fail("invalid_target", `The only resource here is ${urls.resource}`);
      }
      return {
        client,
        redirectUri,
        codeChallenge: request.code_challenge,
        state: request.state,
      } satisfies McpAuthorization;
    });

  const decide = (input: {
    readonly urls: McpOAuthUrls;
    readonly authorization: McpAuthorization;
    readonly decision: McpAuthorizationDecision;
    readonly userId: string | null;
  }) =>
    Effect.gen(function* () {
      const { authorization, decision, urls } = input;
      if (decision["_tag"] === "Deny") {
        return redirectTo(authorization.redirectUri, {
          error: "access_denied",
          error_description: "The request was denied",
          state: authorization.state,
          iss: urls.issuer,
        });
      }

      const grant = yield* grants.validateGrant(decision);
      const now = yield* DateTime.now;
      for (const [code, pending] of pendingCodes) {
        if (DateTime.isLessThanOrEqualTo(pending.expiresAt, now)) {
          pendingCodes.delete(code);
        }
      }
      const code = Encoding.encodeBase64Url(
        yield* crypto.randomBytes(32).pipe(Effect.catchTags({ PlatformError: platformFailure })),
      );
      pendingCodes.set(code, {
        authorization,
        resource: urls.resource,
        grant: { ...grant, access: decision.access },
        approvedByUserId: input.userId,
        expiresAt: DateTime.addDuration(now, AUTHORIZATION_CODE_TTL),
      });
      return redirectTo(authorization.redirectUri, {
        code,
        state: authorization.state,
        iss: urls.issuer,
      });
    });

  const issueTokens = (grantId: string, now: DateTime.Utc) =>
    Effect.gen(function* () {
      const access = yield* createBearerToken;
      const refresh = yield* createBearerToken;
      const createdAt = DateTime.formatIso(now);
      return {
        rows: [
          {
            tokenHash: access.tokenHash,
            grantId,
            kind: "access" as const,
            expiresAt: DateTime.formatIso(DateTime.add(now, { seconds: ACCESS_TOKEN_TTL_SECONDS })),
            createdAt,
          },
          {
            tokenHash: refresh.tokenHash,
            grantId,
            kind: "refresh" as const,
            expiresAt: DateTime.formatIso(DateTime.add(now, { days: REFRESH_TOKEN_TTL_DAYS })),
            createdAt,
          },
        ],
        response: {
          access_token: access.token,
          token_type: "Bearer" as const,
          expires_in: ACCESS_TOKEN_TTL_SECONDS,
          refresh_token: refresh.token,
          scope: SCOPE,
        },
      };
    }).pipe(
      Effect.provideService(Crypto.Crypto, crypto),
      Effect.catchTags({ PlatformError: platformFailure }),
    );

  const tokenError = (error: McpOAuthTokenError["error"], description: string) =>
    Effect.fail(new McpOAuthTokenError({ error, description }));

  const exchangeCode = (urls: McpOAuthUrls, request: McpTokenRequest) =>
    Effect.gen(function* () {
      if (
        request.code === undefined ||
        request.client_id === undefined ||
        request.code_verifier === undefined
      ) {
        return yield* tokenError(
          "invalid_request",
          "code, client_id and code_verifier are required",
        );
      }
      const pending = pendingCodes.get(request.code);
      pendingCodes.delete(request.code);
      const now = yield* DateTime.now;
      if (pending === undefined || DateTime.isLessThanOrEqualTo(pending.expiresAt, now)) {
        return yield* tokenError("invalid_grant", "The authorization code is invalid or expired");
      }
      const { authorization } = pending;
      if (
        authorization.client.clientId !== request.client_id ||
        (request.redirect_uri !== undefined &&
          request.redirect_uri !== authorization.redirectUri) ||
        pending.resource !== urls.resource ||
        (request.resource !== undefined && !sameResource(request.resource, urls.resource))
      ) {
        return yield* tokenError(
          "invalid_grant",
          "The authorization code was issued for another request",
        );
      }
      if (!CODE_VERIFIER.test(request.code_verifier)) {
        return yield* tokenError("invalid_request", "The code verifier is malformed");
      }
      const challenge = yield* crypto
        .digest("SHA-256", new TextEncoder().encode(request.code_verifier))
        .pipe(Effect.catchTags({ PlatformError: platformFailure }));
      if (Encoding.encodeBase64Url(challenge) !== authorization.codeChallenge) {
        return yield* tokenError("invalid_grant", "The code verifier does not match the challenge");
      }

      const grantId = yield* crypto.randomUUIDv4.pipe(
        Effect.catchTags({ PlatformError: platformFailure }),
      );
      const tokens = yield* issueTokens(grantId, now);
      yield* grantRepository.createGrant(
        {
          grantId,
          kind: "oauth",
          label: pending.grant.label,
          access: pending.grant.access,
          environmentIdsJson: pending.grant.environmentIdsJson,
          clientId: authorization.client.clientId,
          createdByUserId: pending.approvedByUserId,
          createdAt: DateTime.formatIso(now),
          lastUsedAt: null,
          expiresAt: null,
        },
        tokens.rows,
      );
      return tokens.response;
    });

  const refresh = (request: McpTokenRequest) =>
    Effect.gen(function* () {
      if (request.refresh_token === undefined || request.client_id === undefined) {
        return yield* tokenError("invalid_request", "refresh_token and client_id are required");
      }
      const now = yield* DateTime.now;
      const usedHash = yield* hashSessionToken(request.refresh_token).pipe(
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.catchTags({ PlatformError: platformFailure }),
      );
      const grant = yield* grantRepository.findGrantByRefreshTokenHash(
        usedHash,
        DateTime.formatIso(now),
      );
      if (grant === undefined || grant.clientId !== request.client_id) {
        return yield* tokenError("invalid_grant", "The refresh token is invalid or expired");
      }
      const tokens = yield* issueTokens(grant.grantId, now);
      const rotated = yield* grantRepository.rotateTokens(usedHash, tokens.rows);
      if (!rotated) {
        return yield* tokenError("invalid_grant", "The refresh token was already used");
      }
      return tokens.response;
    });

  const exchange = (urls: McpOAuthUrls, request: McpTokenRequest) => {
    switch (request.grant_type) {
      case "authorization_code":
        return exchangeCode(urls, request);
      case "refresh_token":
        return refresh(request);
      default:
        return tokenError("unsupported_grant_type", "Use authorization_code or refresh_token");
    }
  };

  const revoke = (token: string) =>
    hashSessionToken(token).pipe(
      Effect.provideService(Crypto.Crypto, crypto),
      Effect.catchTags({ PlatformError: platformFailure }),
      Effect.flatMap(grantRepository.deleteToken),
    );

  return McpOAuth.of({
    register,
    validateAuthorization,
    decide,
    exchange,
    revoke,
  });
});

export const layer = Layer.effect(McpOAuth, make);
