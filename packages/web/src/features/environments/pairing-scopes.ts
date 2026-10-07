import { DEFAULT_BROWSER_TOKEN_SCOPES } from "@t3code-gateway/contracts/schemas";

export const AUTH_ORCHESTRATION_READ_SCOPE = "orchestration:read";
export const AUTH_STANDARD_CLIENT_SCOPES = [...DEFAULT_BROWSER_TOKEN_SCOPES];

export const PAIRING_SCOPE_OPTIONS: ReadonlyArray<{
  readonly scope: string;
  readonly title: string;
  readonly description: string;
}> = [
  {
    scope: AUTH_ORCHESTRATION_READ_SCOPE,
    title: "View environment",
    description: "Read threads, status, diffs, and configuration.",
  },
  {
    scope: "orchestration:operate",
    title: "Operate tasks",
    description: "Start tasks and perform changes in the environment.",
  },
  {
    scope: "terminal:operate",
    title: "Use terminals",
    description: "Create terminals and send input to running shells.",
  },
  {
    scope: "access:read",
    title: "View access",
    description: "Inspect pairing links and authorized clients.",
  },
  {
    scope: "access:write",
    title: "Manage access",
    description: "Issue and revoke credentials for other clients.",
  },
  {
    scope: "relay:read",
    title: "View relay",
    description: "Inspect managed relay connectivity.",
  },
  {
    scope: "relay:write",
    title: "Manage relay",
    description: "Change managed tunnel connectivity.",
  },
];
