import { GatewayRequestContext } from "@t3code-gateway/contracts/gateway-session";
import {
  CreateEnvironmentPairingLinkPayload,
  CreateT3CodeCatalogEntryPayload,
  EnvironmentIdPayload,
  GatewayRpcs,
  RevokeEnvironmentClientPayload,
  UpdateEnvironmentPayload,
  ValidateEnvironmentForEditPayload,
} from "@t3code-gateway/contracts/rpc";
import {
  AuthFailure,
  ChangePasswordRequest,
  EnvironmentFailure,
  EnvironmentInput,
} from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AuthService } from "../auth/service.ts";
import type { DatabaseError } from "../db/errors.ts";
import { EnvironmentService } from "../environments/service.ts";
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

export const layer = GatewayRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const environments = yield* EnvironmentService;
    const traefik = yield* TraefikReconciler;
    const t3codeWeb = yield* T3CodeWebService;

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
    });
  }),
).pipe(Layer.provide(gatewaySessionMiddlewareLayer));
