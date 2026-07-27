import {
  GatewayRequestContext,
  GatewaySessionMiddleware,
} from "@t3code-gateway/contracts/gateway-session";
import {
  GetCurrentUser,
  GetGatewayStatus,
  ListEnvironmentClients,
  ListEnvironments,
} from "@t3code-gateway/contracts/rpc";
import type {
  CurrentUser,
  EnvironmentClientSession,
  EnvironmentRecord,
  GatewayStatus,
} from "@t3code-gateway/contracts/schemas";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as RpcServer from "effect/unstable/rpc/RpcServer";

const currentUser = {
  id: "screenshot-user",
  username: "admin",
} satisfies CurrentUser;

const gatewayStatus = {
  ok: true,
  version: "screenshot-build",
  database: { migrated: true },
  t3codeWeb: { available: true, buildId: "screenshot-build" },
} satisfies GatewayStatus;

const browserTokenScopes = [
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "relay:read",
];

const environmentEntries: ReadonlyArray<readonly [slug: string, label: string]> = [
  ["workstation", "Workstation"],
  ["build-server", "Build Server"],
  ["design-lab", "Design Lab"],
  ["home-server", "Home Server"],
  ["laptop", "Laptop"],
  ["remote-lab", "Remote Lab"],
  ["ci-runner", "CI Runner"],
];

const environments = environmentEntries.map(([slug, label]) => ({
  environmentId: `screenshot-${slug}`,
  slug,
  label,
  enabled: true,
  endpoint: `https://${slug}.internal.example.com`,
  publicUrl: `https://${slug}.code.example.com/`,
  browserTokenScopes,
  createdAt: "2026-07-01T09:00:00.000Z",
  updatedAt: "2026-07-01T09:00:00.000Z",
})) satisfies ReadonlyArray<EnvironmentRecord>;

const clientScopes = [
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "access:read",
  "access:write",
  "relay:read",
  "relay:write",
];

const clients = [
  {
    sessionId: "screenshot-workstation",
    subject: "workstation",
    scopes: clientScopes,
    method: "bearer-access-token",
    client: {
      label: "Workstation",
      ipAddress: "192.0.2.10",
      deviceType: "desktop",
      os: "macOS",
      browser: "T3 Code",
    },
    issuedAt: "2026-07-01T09:00:00.000Z",
    expiresAt: "2027-07-01T09:00:00.000Z",
    lastConnectedAt: "2026-07-26T09:00:00.000Z",
    connected: true,
    current: false,
  },
  {
    sessionId: "screenshot-cli",
    subject: "cli-automation",
    scopes: clientScopes,
    method: "bearer-access-token",
    client: {
      label: "CLI automation",
      ipAddress: "192.0.2.11",
      deviceType: "bot",
    },
    issuedAt: "2026-07-01T09:00:00.000Z",
    expiresAt: "2027-07-01T09:00:00.000Z",
    lastConnectedAt: "2026-07-26T08:00:00.000Z",
    connected: false,
    current: false,
  },
  {
    sessionId: "screenshot-design-laptop",
    subject: "design-laptop",
    scopes: clientScopes,
    method: "bearer-access-token",
    client: {
      label: "Design laptop",
      ipAddress: "192.0.2.12",
      deviceType: "desktop",
      os: "Windows",
      browser: "T3 Code",
    },
    issuedAt: "2026-07-01T09:00:00.000Z",
    expiresAt: "2027-07-01T09:00:00.000Z",
    lastConnectedAt: "2026-07-25T18:00:00.000Z",
    connected: false,
    current: false,
  },
  {
    sessionId: "screenshot-browser",
    subject: "browser-client",
    scopes: clientScopes,
    method: "browser-session-cookie",
    client: {
      label: "Browser client",
      ipAddress: "192.0.2.13",
      deviceType: "unknown",
      os: "Linux",
      browser: "Chrome",
    },
    issuedAt: "2026-07-01T09:00:00.000Z",
    expiresAt: "2027-07-01T09:00:00.000Z",
    lastConnectedAt: "2026-07-25T16:00:00.000Z",
    connected: false,
    current: false,
  },
  {
    sessionId: "screenshot-build-agent",
    subject: "build-agent",
    scopes: clientScopes,
    method: "bearer-access-token",
    client: {
      label: "Build agent",
      ipAddress: "192.0.2.14",
      deviceType: "bot",
    },
    issuedAt: "2026-07-01T09:00:00.000Z",
    expiresAt: "2027-07-01T09:00:00.000Z",
    lastConnectedAt: "2026-07-25T14:00:00.000Z",
    connected: false,
    current: false,
  },
  {
    sessionId: "screenshot-review-station",
    subject: "review-station",
    scopes: clientScopes,
    method: "bearer-access-token",
    client: {
      label: "Review station",
      ipAddress: "192.0.2.15",
      deviceType: "desktop",
      os: "macOS",
      browser: "T3 Code",
    },
    issuedAt: "2026-07-01T09:00:00.000Z",
    expiresAt: "2027-07-01T09:00:00.000Z",
    lastConnectedAt: "2026-07-25T12:00:00.000Z",
    connected: false,
    current: false,
  },
  {
    sessionId: "screenshot-remote-lab",
    subject: "remote-lab",
    scopes: clientScopes,
    method: "bearer-access-token",
    client: {
      label: "Remote lab",
      ipAddress: "192.0.2.16",
      deviceType: "desktop",
      os: "Linux",
      browser: "T3 Code",
    },
    issuedAt: "2026-07-01T09:00:00.000Z",
    expiresAt: "2027-07-01T09:00:00.000Z",
    lastConnectedAt: "2026-07-25T10:00:00.000Z",
    connected: false,
    current: false,
  },
] satisfies ReadonlyArray<EnvironmentClientSession>;

const ScreenshotRpcs = RpcGroup.make(
  GetCurrentUser,
  GetGatewayStatus,
  ListEnvironments,
  ListEnvironmentClients,
);

const screenshotRpcHandlers = ScreenshotRpcs.toLayer(
  ScreenshotRpcs.of({
    "gateway.auth.me": () => Effect.succeed(currentUser),
    "gateway.status": () => Effect.succeed(gatewayStatus),
    "gateway.environments.list": () => Effect.succeed(environments),
    "gateway.environments.clients.list": () => Effect.succeed(clients),
  }),
);

const screenshotSessionMiddleware = Layer.succeed(GatewaySessionMiddleware, (effect) =>
  Effect.provideService(effect, GatewayRequestContext, {
    sessionToken: undefined,
    secure: false,
  }),
);

export const screenshotRpcLayer = RpcServer.layerHttp({
  group: ScreenshotRpcs,
  path: "/api/gateway/rpc",
  protocol: "http",
}).pipe(
  Layer.provide(screenshotRpcHandlers),
  Layer.provide(screenshotSessionMiddleware),
  Layer.provide(RpcSerialization.layerJson),
);
