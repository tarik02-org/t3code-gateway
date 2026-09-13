import type {
  ChangePasswordRequest,
  CheckT3CodeWebUpdatesRequest,
  CreateEnvironmentPairingLinkRequest,
  CurrentUser,
  EnvironmentClientSession,
  EnvironmentInput,
  EnvironmentPairingLink,
  EnvironmentRecord,
  GatewayStatus,
  InstallT3CodeWebReleaseRequest,
  LoginRequest,
  LoginResponse,
  RevokeEnvironmentClientResponse,
  T3CodeCatalogEntryRequest,
  T3CodeCatalogEntryResponse,
  T3CodeWebRelease,
  TraefikConfigResponse,
  UpdateT3CodeWebSettingsRequest,
  SetT3CodeWebVersionPinRequest,
  T3CodeWebVersionRequest,
  UpdateEnvironmentRequest,
  ValidateEnvironmentResponse,
} from "@t3code-gateway/contracts/schemas";

import { runGatewayRpc } from "./gateway-rpc.ts";

const jsonHeaders = {
  "content-type": "application/json",
} as const;

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const response = await fetch("/api/gateway/auth/login", {
    method: "POST",
    credentials: "include",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

  return readJson<LoginResponse>(response);
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/gateway/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  await readJson<void>(response);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return runGatewayRpc((client) => client["gateway.auth.me"](undefined));
}

export async function changePassword(payload: ChangePasswordRequest): Promise<void> {
  await runGatewayRpc((client) => client["gateway.auth.changePassword"](payload));
}

export async function getGatewayStatus(): Promise<GatewayStatus> {
  return runGatewayRpc((client) => client["gateway.status"](undefined));
}

export async function updateT3CodeWebSettings(
  payload: UpdateT3CodeWebSettingsRequest,
): Promise<GatewayStatus> {
  return runGatewayRpc((client) => client["gateway.t3codeWeb.settings.update"](payload));
}

export async function checkT3CodeWebUpdates(
  payload: CheckT3CodeWebUpdatesRequest,
): Promise<GatewayStatus> {
  return runGatewayRpc((client) => client["gateway.t3codeWeb.updates.check"](payload));
}

export async function listT3CodeWebReleases(): Promise<ReadonlyArray<T3CodeWebRelease>> {
  return runGatewayRpc((client) => client["gateway.t3codeWeb.releases.list"](undefined));
}

export async function installT3CodeWebRelease(
  payload: InstallT3CodeWebReleaseRequest,
): Promise<GatewayStatus> {
  return runGatewayRpc((client) => client["gateway.t3codeWeb.releases.install"](payload));
}

export async function activateT3CodeWebVersion(
  payload: T3CodeWebVersionRequest,
): Promise<GatewayStatus> {
  return runGatewayRpc((client) => client["gateway.t3codeWeb.versions.activate"](payload));
}

export async function removeT3CodeWebVersion(
  payload: T3CodeWebVersionRequest,
): Promise<GatewayStatus> {
  return runGatewayRpc((client) => client["gateway.t3codeWeb.versions.remove"](payload));
}

export async function setT3CodeWebVersionPin(
  payload: SetT3CodeWebVersionPinRequest,
): Promise<GatewayStatus> {
  return runGatewayRpc((client) => client["gateway.t3codeWeb.versions.pin"](payload));
}

export async function garbageCollectT3CodeWebVersions(): Promise<GatewayStatus> {
  return runGatewayRpc((client) => client["gateway.t3codeWeb.versions.gc"](undefined));
}

export async function getTraefikConfig(): Promise<TraefikConfigResponse> {
  return runGatewayRpc((client) => client["gateway.traefik.config"](undefined));
}

export async function listEnvironments(): Promise<ReadonlyArray<EnvironmentRecord>> {
  return runGatewayRpc((client) => client["gateway.environments.list"](undefined));
}

export async function getEnvironment(environmentId: string): Promise<EnvironmentRecord> {
  return runGatewayRpc((client) => client["gateway.environments.get"]({ environmentId }));
}

export async function validateEnvironment(
  payload: EnvironmentInput,
): Promise<ValidateEnvironmentResponse> {
  return runGatewayRpc((client) => client["gateway.environments.validate"](payload));
}

export async function validateEnvironmentForEdit(
  environmentId: string,
  payload: EnvironmentInput,
): Promise<ValidateEnvironmentResponse> {
  return runGatewayRpc((client) =>
    client["gateway.environments.validateForEdit"]({ environmentId, input: payload }),
  );
}

export async function createEnvironment(payload: EnvironmentInput): Promise<EnvironmentRecord> {
  return runGatewayRpc((client) => client["gateway.environments.create"](payload));
}

export async function updateEnvironment(
  environmentId: string,
  payload: UpdateEnvironmentRequest,
): Promise<EnvironmentRecord> {
  return runGatewayRpc((client) =>
    client["gateway.environments.update"]({ environmentId, input: payload }),
  );
}

export async function deleteEnvironment(environmentId: string): Promise<void> {
  await runGatewayRpc((client) => client["gateway.environments.delete"]({ environmentId }));
}

export async function listEnvironmentClients(
  environmentId: string,
): Promise<ReadonlyArray<EnvironmentClientSession>> {
  return runGatewayRpc((client) => client["gateway.environments.clients.list"]({ environmentId }));
}

export async function createEnvironmentPairingLink(
  environmentId: string,
  payload: CreateEnvironmentPairingLinkRequest,
): Promise<EnvironmentPairingLink> {
  return runGatewayRpc((client) =>
    client["gateway.environments.pairingLink"]({ environmentId, input: payload }),
  );
}

export async function createT3CodeCatalogEntry(
  environmentId: string,
  payload: T3CodeCatalogEntryRequest,
): Promise<T3CodeCatalogEntryResponse> {
  return runGatewayRpc((client) =>
    client["gateway.environments.t3codeCatalogEntry"]({ environmentId, input: payload }),
  );
}

export async function revokeEnvironmentClient(
  environmentId: string,
  sessionId: string,
): Promise<RevokeEnvironmentClientResponse> {
  return runGatewayRpc((client) =>
    client["gateway.environments.clients.revoke"]({ environmentId, sessionId }),
  );
}
