import * as Schema from "effect/Schema";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

import { GatewaySessionMiddleware } from "./gateway-session.ts";
import {
  AuthFailure,
  ChangePasswordRequest,
  CheckT3CodeWebUpdatesRequest,
  CreateEnvironmentPairingLinkRequest,
  CurrentUser,
  EnvironmentClientSession,
  EnvironmentFailure,
  EnvironmentInput,
  EnvironmentPairingLink,
  EnvironmentRecord,
  GatewayStatus,
  RevokeEnvironmentClientResponse,
  T3CodeCatalogEntryRequest,
  T3CodeCatalogEntryResponse,
  T3CodeWebFailure,
  UpdateT3CodeWebSettingsRequest,
  TraefikConfigResponse,
  UpdateEnvironmentRequest,
  ValidateEnvironmentResponse,
} from "./schemas.ts";

export const EnvironmentIdPayload = Schema.Struct({
  environmentId: Schema.String,
});

export type EnvironmentIdPayload = typeof EnvironmentIdPayload.Type;

export const ValidateEnvironmentForEditPayload = Schema.Struct({
  environmentId: Schema.String,
  input: EnvironmentInput,
});

export type ValidateEnvironmentForEditPayload = typeof ValidateEnvironmentForEditPayload.Type;

export const UpdateEnvironmentPayload = Schema.Struct({
  environmentId: Schema.String,
  input: UpdateEnvironmentRequest,
});

export type UpdateEnvironmentPayload = typeof UpdateEnvironmentPayload.Type;

export const CreateEnvironmentPairingLinkPayload = Schema.Struct({
  environmentId: Schema.String,
  input: CreateEnvironmentPairingLinkRequest,
});

export type CreateEnvironmentPairingLinkPayload = typeof CreateEnvironmentPairingLinkPayload.Type;

export const CreateT3CodeCatalogEntryPayload = Schema.Struct({
  environmentId: Schema.String,
  input: T3CodeCatalogEntryRequest,
});

export type CreateT3CodeCatalogEntryPayload = typeof CreateT3CodeCatalogEntryPayload.Type;

export const RevokeEnvironmentClientPayload = Schema.Struct({
  environmentId: Schema.String,
  sessionId: Schema.String,
});

export type RevokeEnvironmentClientPayload = typeof RevokeEnvironmentClientPayload.Type;

export class UpdateT3CodeWebSettings extends Rpc.make("gateway.t3codeWeb.settings.update", {
  payload: UpdateT3CodeWebSettingsRequest,
  success: GatewayStatus,
  error: T3CodeWebFailure,
}).middleware(GatewaySessionMiddleware) {}

export class CheckT3CodeWebUpdates extends Rpc.make("gateway.t3codeWeb.updates.check", {
  payload: CheckT3CodeWebUpdatesRequest,
  success: GatewayStatus,
  error: T3CodeWebFailure,
}).middleware(GatewaySessionMiddleware) {}

export class GetCurrentUser extends Rpc.make("gateway.auth.me", {
  success: Schema.NullOr(CurrentUser),
}).middleware(GatewaySessionMiddleware) {}

export class ChangePassword extends Rpc.make("gateway.auth.changePassword", {
  payload: ChangePasswordRequest,
  error: AuthFailure,
}).middleware(GatewaySessionMiddleware) {}

export class GetGatewayStatus extends Rpc.make("gateway.status", {
  success: GatewayStatus,
}).middleware(GatewaySessionMiddleware) {}

export class ListEnvironments extends Rpc.make("gateway.environments.list", {
  success: Schema.Array(EnvironmentRecord),
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class GetEnvironment extends Rpc.make("gateway.environments.get", {
  payload: EnvironmentIdPayload,
  success: EnvironmentRecord,
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class ValidateEnvironment extends Rpc.make("gateway.environments.validate", {
  payload: EnvironmentInput,
  success: ValidateEnvironmentResponse,
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class ValidateEnvironmentForEdit extends Rpc.make("gateway.environments.validateForEdit", {
  payload: ValidateEnvironmentForEditPayload,
  success: ValidateEnvironmentResponse,
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class CreateEnvironment extends Rpc.make("gateway.environments.create", {
  payload: EnvironmentInput,
  success: EnvironmentRecord,
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class UpdateEnvironment extends Rpc.make("gateway.environments.update", {
  payload: UpdateEnvironmentPayload,
  success: EnvironmentRecord,
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class DeleteEnvironment extends Rpc.make("gateway.environments.delete", {
  payload: EnvironmentIdPayload,
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class ListEnvironmentClients extends Rpc.make("gateway.environments.clients.list", {
  payload: EnvironmentIdPayload,
  success: Schema.Array(EnvironmentClientSession),
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class CreateEnvironmentPairingLink extends Rpc.make("gateway.environments.pairingLink", {
  payload: CreateEnvironmentPairingLinkPayload,
  success: EnvironmentPairingLink,
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class CreateT3CodeCatalogEntry extends Rpc.make("gateway.environments.t3codeCatalogEntry", {
  payload: CreateT3CodeCatalogEntryPayload,
  success: T3CodeCatalogEntryResponse,
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class RevokeEnvironmentClient extends Rpc.make("gateway.environments.clients.revoke", {
  payload: RevokeEnvironmentClientPayload,
  success: RevokeEnvironmentClientResponse,
  error: EnvironmentFailure,
}).middleware(GatewaySessionMiddleware) {}

export class GetTraefikConfig extends Rpc.make("gateway.traefik.config", {
  success: TraefikConfigResponse,
}).middleware(GatewaySessionMiddleware) {}

export class GatewayRpcs extends RpcGroup.make(
  GetCurrentUser,
  ChangePassword,
  GetGatewayStatus,
  ListEnvironments,
  GetEnvironment,
  ValidateEnvironment,
  ValidateEnvironmentForEdit,
  CreateEnvironment,
  UpdateEnvironment,
  DeleteEnvironment,
  ListEnvironmentClients,
  CreateEnvironmentPairingLink,
  CreateT3CodeCatalogEntry,
  RevokeEnvironmentClient,
  GetTraefikConfig,
  UpdateT3CodeWebSettings,
  CheckT3CodeWebUpdates,
) {}
