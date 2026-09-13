import * as Schema from "effect/Schema";

export const T3CodeWebVersionSource = Schema.Literals(["bundled", "downloaded"]);

export type T3CodeWebVersionSource = typeof T3CodeWebVersionSource.Type;

export const T3CodeWebVersion = Schema.Struct({
  channel: Schema.Literals(["stable", "nightly"]),
  version: Schema.String,
  source: T3CodeWebVersionSource,
  active: Schema.Boolean,
  pinned: Schema.Boolean,
  forcedPinned: Schema.Boolean,
});

export type T3CodeWebVersion = typeof T3CodeWebVersion.Type;

export const T3CodeWebStatus = Schema.Struct({
  available: Schema.Boolean,
  channel: Schema.Literals(["stable", "nightly"]),
  autoUpdate: Schema.Boolean,
  versions: Schema.Array(T3CodeWebVersion),
});

export type T3CodeWebStatus = typeof T3CodeWebStatus.Type;

export const GatewayStatus = Schema.Struct({
  ok: Schema.Boolean,
  version: Schema.String,
  database: Schema.Struct({
    migrated: Schema.Boolean,
  }),
  t3codeWeb: T3CodeWebStatus,
});

export type GatewayStatus = typeof GatewayStatus.Type;

export const T3CodeWebChannel = Schema.Literals(["stable", "nightly"]);

export type T3CodeWebChannel = typeof T3CodeWebChannel.Type;

export const UpdateT3CodeWebSettingsRequest = Schema.Struct({
  channel: Schema.optional(T3CodeWebChannel),
  autoUpdate: Schema.optional(Schema.Boolean),
});

export type UpdateT3CodeWebSettingsRequest = typeof UpdateT3CodeWebSettingsRequest.Type;

export const CheckT3CodeWebUpdatesRequest = Schema.Struct({
  channel: T3CodeWebChannel,
});

export type CheckT3CodeWebUpdatesRequest = typeof CheckT3CodeWebUpdatesRequest.Type;

export const T3CodeWebVersionRequest = Schema.Struct({
  channel: T3CodeWebChannel,
  version: Schema.String,
});

export type T3CodeWebVersionRequest = typeof T3CodeWebVersionRequest.Type;

export const SetT3CodeWebVersionPinRequest = Schema.Struct({
  channel: T3CodeWebChannel,
  version: Schema.NullOr(Schema.String),
});

export type SetT3CodeWebVersionPinRequest = typeof SetT3CodeWebVersionPinRequest.Type;

export class T3CodeWebFailure extends Schema.TaggedErrorClass<T3CodeWebFailure>()(
  "T3CodeWebFailure",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

export const LoginRequest = Schema.Struct({
  username: Schema.String,
  password: Schema.String,
});

export type LoginRequest = typeof LoginRequest.Type;

export const CurrentUser = Schema.Struct({
  id: Schema.String,
  username: Schema.String,
});

export type CurrentUser = typeof CurrentUser.Type;

export const LoginResponse = Schema.Struct({
  user: CurrentUser,
});

export type LoginResponse = typeof LoginResponse.Type;

export const ChangePasswordRequest = Schema.Struct({
  currentPassword: Schema.String,
  nextPassword: Schema.String,
});

export type ChangePasswordRequest = typeof ChangePasswordRequest.Type;

export class AuthFailure extends Schema.TaggedErrorClass<AuthFailure>()("AuthFailure", {
  message: Schema.String,
}) {}

export const T3CodeCatalogEntryRequest = Schema.Struct({
  clientLabel: Schema.optional(Schema.String),
});

export type T3CodeCatalogEntryRequest = typeof T3CodeCatalogEntryRequest.Type;

export const BearerConnectionTarget = Schema.TaggedStruct("BearerConnectionTarget", {
  environmentId: Schema.String,
  label: Schema.String,
  connectionId: Schema.String,
});

export type BearerConnectionTarget = typeof BearerConnectionTarget.Type;

export const BearerConnectionProfile = Schema.TaggedStruct("BearerConnectionProfile", {
  connectionId: Schema.String,
  environmentId: Schema.String,
  label: Schema.String,
  httpBaseUrl: Schema.String,
  wsBaseUrl: Schema.String,
});

export type BearerConnectionProfile = typeof BearerConnectionProfile.Type;

export const StoredConnectionCredential = Schema.Struct({
  connectionId: Schema.String,
  credential: Schema.TaggedStruct("BearerConnectionCredential", {
    token: Schema.String,
  }),
});

export type StoredConnectionCredential = typeof StoredConnectionCredential.Type;

export const T3CodeCatalogEntryResponse = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  target: BearerConnectionTarget,
  profile: BearerConnectionProfile,
  credential: StoredConnectionCredential,
});

export type T3CodeCatalogEntryResponse = typeof T3CodeCatalogEntryResponse.Type;

export const DEFAULT_BROWSER_TOKEN_SCOPES = [
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "relay:read",
] as const;

export const EnvironmentInput = Schema.Struct({
  environmentId: Schema.optional(Schema.String),
  slug: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  endpoint: Schema.String,
  pairingCode: Schema.optional(Schema.String),
  adminBearerToken: Schema.optional(Schema.String),
  browserTokenScopes: Schema.optional(Schema.Array(Schema.String)),
});

export type EnvironmentInput = typeof EnvironmentInput.Type;

export const UpdateEnvironmentRequest = Schema.Struct({
  slug: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  endpoint: Schema.optional(Schema.String),
  pairingCode: Schema.optional(Schema.String),
  adminBearerToken: Schema.optional(Schema.String),
  browserTokenScopes: Schema.optional(Schema.Array(Schema.String)),
  enabled: Schema.optional(Schema.Boolean),
});

export type UpdateEnvironmentRequest = typeof UpdateEnvironmentRequest.Type;

export const EnvironmentAdminTokenStatus = Schema.Union([
  Schema.TaggedStruct("Unknown", {}),
  Schema.TaggedStruct("Healthy", {
    expiresAt: Schema.String,
    lastCheckedAt: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("RotationDue", {
    expiresAt: Schema.String,
    lastCheckedAt: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("Retrying", {
    expiresAt: Schema.NullOr(Schema.String),
    lastAttemptAt: Schema.String,
    message: Schema.String,
  }),
  Schema.TaggedStruct("RepairRequired", {
    expiresAt: Schema.NullOr(Schema.String),
    lastAttemptAt: Schema.String,
    message: Schema.String,
  }),
  Schema.TaggedStruct("Paused", {
    expiresAt: Schema.NullOr(Schema.String),
    lastCheckedAt: Schema.NullOr(Schema.String),
    lastFailure: Schema.NullOr(Schema.String),
  }),
]);

export type EnvironmentAdminTokenStatus = typeof EnvironmentAdminTokenStatus.Type;

export const EnvironmentRecord = Schema.Struct({
  environmentId: Schema.String,
  slug: Schema.String,
  label: Schema.String,
  enabled: Schema.Boolean,
  endpoint: Schema.String,
  publicUrl: Schema.String,
  descriptor: Schema.optional(Schema.Unknown),
  browserTokenScopes: Schema.Array(Schema.String),
  adminTokenStatus: EnvironmentAdminTokenStatus,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type EnvironmentRecord = typeof EnvironmentRecord.Type;

export const CreateEnvironmentPairingLinkRequest = Schema.Struct({
  label: Schema.String,
  scopes: Schema.Array(Schema.String),
});

export type CreateEnvironmentPairingLinkRequest = typeof CreateEnvironmentPairingLinkRequest.Type;

export const EnvironmentPairingLink = Schema.Struct({
  label: Schema.String,
  scopes: Schema.Array(Schema.String),
  pairingCode: Schema.String,
  pairingUrl: Schema.String,
});

export type EnvironmentPairingLink = typeof EnvironmentPairingLink.Type;

export class EnvironmentFailure extends Schema.TaggedErrorClass<EnvironmentFailure>()(
  "EnvironmentFailure",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  },
) {}

export const ValidateEnvironmentResponse = Schema.Struct({
  environmentId: Schema.String,
  descriptor: Schema.Unknown,
  publicUrl: Schema.String,
});

export type ValidateEnvironmentResponse = typeof ValidateEnvironmentResponse.Type;

export const TraefikConfigResponse = Schema.Struct({
  yaml: Schema.String,
  dynamicFilePath: Schema.optional(Schema.String),
});

export type TraefikConfigResponse = typeof TraefikConfigResponse.Type;

export const EnvironmentClientMetadataDeviceType = Schema.Literals([
  "desktop",
  "mobile",
  "tablet",
  "bot",
  "unknown",
]);

export type EnvironmentClientMetadataDeviceType = typeof EnvironmentClientMetadataDeviceType.Type;

export const EnvironmentClientMetadata = Schema.Struct({
  label: Schema.optional(Schema.String),
  ipAddress: Schema.optional(Schema.String),
  userAgent: Schema.optional(Schema.String),
  deviceType: EnvironmentClientMetadataDeviceType,
  os: Schema.optional(Schema.String),
  browser: Schema.optional(Schema.String),
});

export type EnvironmentClientMetadata = typeof EnvironmentClientMetadata.Type;

export const EnvironmentClientSessionMethod = Schema.Literals([
  "browser-session-cookie",
  "bearer-access-token",
  "dpop-access-token",
]);

export type EnvironmentClientSessionMethod = typeof EnvironmentClientSessionMethod.Type;

export const EnvironmentClientGatewayRole = Schema.Literals(["admin"]);

export type EnvironmentClientGatewayRole = typeof EnvironmentClientGatewayRole.Type;

export const EnvironmentClientSession = Schema.Struct({
  sessionId: Schema.String,
  subject: Schema.String,
  scopes: Schema.Array(Schema.String),
  method: EnvironmentClientSessionMethod,
  client: EnvironmentClientMetadata,
  issuedAt: Schema.String,
  expiresAt: Schema.String,
  lastConnectedAt: Schema.NullOr(Schema.String),
  connected: Schema.Boolean,
  current: Schema.Boolean,
  gatewayRole: Schema.optional(EnvironmentClientGatewayRole),
});

export type EnvironmentClientSession = typeof EnvironmentClientSession.Type;

export const RevokeEnvironmentClientResponse = Schema.Struct({
  revoked: Schema.Boolean,
});

export type RevokeEnvironmentClientResponse = typeof RevokeEnvironmentClientResponse.Type;
