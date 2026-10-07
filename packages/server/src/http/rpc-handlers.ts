import { GatewayRequestContext } from "@t3code-gateway/contracts/gateway-session";
import {
  CreateEnvironmentPairingLinkPayload,
  CreateT3CodeCatalogEntryPayload,
  DecideMcpAuthorizationPayload,
  EnvironmentIdPayload,
  GatewayRpcs,
  McpGrantIdPayload,
  RevokeEnvironmentClientPayload,
  UpdateEnvironmentPayload,
  ValidateEnvironmentForEditPayload,
} from "@t3code-gateway/contracts/rpc";
import {
  AuthFailure,
  ChangePasswordRequest,
  EnvironmentFailure,
  CreateMcpTokenRequest,
  EnvironmentInput,
  McpAuthorizationRequest,
  McpFailure,
} from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AuthService } from "../auth/service.ts";
import type { DatabaseError } from "../db/errors.ts";
import { EnvironmentService } from "../environments/service.ts";
import { McpGrants } from "../mcp/grants.ts";
import { McpOAuth, type McpOAuthPageError, mcpOAuthUrls, redirectForError } from "../mcp/oauth.ts";
import { McpUpstreamCredentials } from "../mcp/upstream-credentials.ts";
import { T3CodeWebService } from "../t3code-web/service.ts";
import { TraefikReconciler } from "../traefik/reconciler.ts";
import { buildGatewayStatus } from "./status.ts";
import { layer as gatewaySessionMiddlewareLayer } from "./gateway-session-middleware.ts";

const environmentRpcDatabaseErrors = {
  DatabaseError: (error: DatabaseError) =>
    Effect.fail(new EnvironmentFailure({ message: error.message, status: 500 })),
};

const environmentRpcErrors = {
  EnvironmentFailure: (error: EnvironmentFailure) => Effect.fail(error),
  ...environmentRpcDatabaseErrors,
};

const mcpRpcDatabaseErrors = {
  DatabaseError: (error: DatabaseError) => Effect.fail(new McpFailure({ message: error.message })),
};

const mcpRpcErrors = {
  McpFailure: (error: McpFailure) => Effect.fail(error),
  ...mcpRpcDatabaseErrors,
};

/** A request naming an unknown client or redirect: the consent page shows it. */
const oauthPageFailure = (error: McpOAuthPageError) =>
  Effect.fail(new McpFailure({ message: error.description }));

export const layer = GatewayRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const environments = yield* EnvironmentService;
    const traefik = yield* TraefikReconciler;
    const t3codeWeb = yield* T3CodeWebService;
    const mcpGrants = yield* McpGrants;
    const mcpCredentials = yield* McpUpstreamCredentials;
    const mcpOAuth = yield* McpOAuth;

    return GatewayRpcs.of({
      "gateway.auth.me": () =>
        Effect.gen(function* () {
          const { sessionToken } = yield* GatewayRequestContext;
          return yield* auth.currentUser(sessionToken);
        }).pipe(Effect.orDie),

      "gateway.auth.changePassword": (payload: ChangePasswordRequest) =>
        Effect.gen(function* () {
          const { sessionToken } = yield* GatewayRequestContext;
          yield* auth.changePassword(sessionToken, payload.currentPassword, payload.nextPassword);
        }).pipe(
          Effect.catchTags({
            AuthFailure: (error) => Effect.fail(error),
            DatabaseError: (error) => Effect.fail(new AuthFailure({ message: error.message })),
          }),
        ),

      "gateway.status": () => buildGatewayStatus().pipe(Effect.orDie),

      "gateway.t3codeWeb.settings.update": (payload) =>
        t3codeWeb.updateSettings(payload).pipe(
          Effect.flatMap(() => buildGatewayStatus().pipe(Effect.orDie)),
          Effect.catchTag("T3CodeWebFailure", (error) => Effect.fail(error)),
        ),

      "gateway.t3codeWeb.updates.check": (payload) =>
        t3codeWeb.checkForUpdates(payload.channel).pipe(
          Effect.flatMap(() => buildGatewayStatus().pipe(Effect.orDie)),
          Effect.catchTag("T3CodeWebFailure", (error) => Effect.fail(error)),
        ),

      "gateway.t3codeWeb.releases.list": () =>
        t3codeWeb.listReleases.pipe(
          Effect.catchTag("T3CodeWebFailure", (error) => Effect.fail(error)),
        ),

      "gateway.t3codeWeb.releases.install": (payload) =>
        t3codeWeb.installRelease(payload.channel, payload.version).pipe(
          Effect.flatMap(() => buildGatewayStatus().pipe(Effect.orDie)),
          Effect.catchTag("T3CodeWebFailure", (error) => Effect.fail(error)),
        ),

      "gateway.t3codeWeb.versions.activate": (payload) =>
        t3codeWeb.activateVersion(payload.channel, payload.version).pipe(
          Effect.flatMap(() => buildGatewayStatus().pipe(Effect.orDie)),
          Effect.catchTag("T3CodeWebFailure", (error) => Effect.fail(error)),
        ),

      "gateway.t3codeWeb.versions.remove": (payload) =>
        t3codeWeb.removeVersion(payload.channel, payload.version).pipe(
          Effect.flatMap(() => buildGatewayStatus().pipe(Effect.orDie)),
          Effect.catchTag("T3CodeWebFailure", (error) => Effect.fail(error)),
        ),

      "gateway.t3codeWeb.versions.pin": (payload) =>
        t3codeWeb.setVersionPin(payload.channel, payload.version).pipe(
          Effect.flatMap(() => buildGatewayStatus().pipe(Effect.orDie)),
          Effect.catchTag("T3CodeWebFailure", (error) => Effect.fail(error)),
        ),

      "gateway.t3codeWeb.versions.gc": () =>
        t3codeWeb.garbageCollect.pipe(
          Effect.flatMap(() => buildGatewayStatus().pipe(Effect.orDie)),
          Effect.catchTag("T3CodeWebFailure", (error) => Effect.fail(error)),
        ),

      "gateway.environments.list": () =>
        environments.list().pipe(Effect.catchTags(environmentRpcDatabaseErrors)),

      "gateway.environments.get": (payload: EnvironmentIdPayload) =>
        environments.get(payload.environmentId).pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.environments.validate": (payload: EnvironmentInput) =>
        environments.validate(payload).pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.environments.validateForEdit": (payload: ValidateEnvironmentForEditPayload) =>
        environments
          .validateForEdit(payload.environmentId, payload.input)
          .pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.environments.create": (payload: EnvironmentInput) =>
        Effect.gen(function* () {
          const created = yield* environments.create(payload);
          yield* traefik.reconcile();
          return created;
        }).pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.environments.update": (payload: UpdateEnvironmentPayload) =>
        Effect.gen(function* () {
          const updated = yield* environments.update(payload.environmentId, payload.input);
          yield* traefik.reconcile();
          return updated;
        }).pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.environments.delete": (payload: EnvironmentIdPayload) =>
        Effect.gen(function* () {
          yield* environments.remove(payload.environmentId);
          yield* traefik.reconcile();
        }).pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.environments.clients.list": (payload: EnvironmentIdPayload) =>
        environments
          .listClients(payload.environmentId)
          .pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.environments.pairingLink": (payload: CreateEnvironmentPairingLinkPayload) =>
        environments
          .createPairingLink(payload.environmentId, payload.input)
          .pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.environments.t3codeCatalogEntry": (payload: CreateT3CodeCatalogEntryPayload) =>
        environments
          .createT3CodeCatalogEntry(payload.environmentId, payload.input)
          .pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.environments.clients.revoke": (payload: RevokeEnvironmentClientPayload) =>
        environments
          .revokeClient(payload.environmentId, payload.sessionId)
          .pipe(Effect.catchTags(environmentRpcErrors)),

      "gateway.traefik.config": () => traefik.getConfig(),

      "gateway.mcp.grants.list": () => mcpGrants.list.pipe(Effect.catchTags(mcpRpcDatabaseErrors)),

      "gateway.mcp.tokens.create": (payload: CreateMcpTokenRequest) =>
        Effect.gen(function* () {
          const { sessionToken } = yield* GatewayRequestContext;
          const user = yield* auth.currentUser(sessionToken);
          return yield* mcpGrants.createToken(payload, user?.id ?? null);
        }).pipe(Effect.catchTags(mcpRpcErrors)),

      "gateway.mcp.grants.revoke": (payload: McpGrantIdPayload) =>
        mcpGrants.revoke(payload.grantId).pipe(Effect.catchTags(mcpRpcErrors)),

      "gateway.mcp.oauth.describe": (payload: McpAuthorizationRequest) =>
        Effect.gen(function* () {
          const urls = mcpOAuthUrls((yield* GatewayRequestContext).origin);
          return yield* mcpOAuth.validateAuthorization(urls, payload).pipe(
            Effect.map(
              (authorization) =>
                ({
                  _tag: "Pending",
                  clientName: authorization.client.name,
                  redirectUri: authorization.redirectUri,
                }) as const,
            ),
            Effect.catchTags({
              McpOAuthPageError: oauthPageFailure,
              McpOAuthRedirectError: (error) =>
                Effect.succeed({
                  _tag: "Redirect",
                  redirectTo: redirectForError(error, urls),
                } as const),
            }),
          );
        }),

      "gateway.mcp.oauth.decide": (payload: DecideMcpAuthorizationPayload) =>
        Effect.gen(function* () {
          const { origin, sessionToken } = yield* GatewayRequestContext;
          const urls = mcpOAuthUrls(origin);
          const validated = yield* mcpOAuth.validateAuthorization(urls, payload.authorization).pipe(
            Effect.map((authorization) => ({ authorization })),
            Effect.catchTags({
              McpOAuthPageError: oauthPageFailure,
              McpOAuthRedirectError: (error) =>
                Effect.succeed({ redirectTo: redirectForError(error, urls) }),
            }),
          );
          if ("redirectTo" in validated) {
            return validated;
          }
          const { authorization } = validated;
          const user = yield* auth.currentUser(sessionToken);
          const redirectTo = yield* mcpOAuth.decide({
            urls,
            authorization,
            decision: payload.decision,
            userId: user?.id ?? null,
          });
          return { redirectTo };
        }).pipe(Effect.catchTags(mcpRpcErrors)),

      "gateway.mcp.upstream.list": () =>
        mcpCredentials.listStatus.pipe(Effect.catchTags(mcpRpcDatabaseErrors)),
    });
  }),
).pipe(Layer.provide(gatewaySessionMiddlewareLayer));
