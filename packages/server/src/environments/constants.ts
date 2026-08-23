import { DEFAULT_BROWSER_TOKEN_SCOPES } from "@t3code-gateway/contracts/schemas";

export const DEFAULT_ENVIRONMENT_BROWSER_TOKEN_SCOPES = [...DEFAULT_BROWSER_TOKEN_SCOPES];

export const ADMIN_TOKEN_SCOPES = [
  "orchestration:read",
  "orchestration:operate",
  "terminal:operate",
  "review:write",
  "relay:read",
  "access:read",
  "access:write",
  "relay:write",
] as const;

export const ADMIN_TOKEN_ROTATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
export const ADMIN_TOKEN_SWEEP_INTERVAL = "1 hour";
export const ADMIN_TOKEN_SWEEP_TIMEOUT = "30 seconds";
export const ADMIN_TOKEN_SWEEP_CONCURRENCY = 4;
