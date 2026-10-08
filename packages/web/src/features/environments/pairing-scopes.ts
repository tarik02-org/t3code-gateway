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
    description: "Read threads, status, checkpoints, and configuration.",
  },
  {
    scope: "orchestration:operate",
    title: "Operate tasks",
    description: "Start, update, and stop tasks.",
  },
  {
    scope: "settings:write",
    title: "Change environment settings",
    description: "Edit environment preferences and keybindings.",
  },
  {
    scope: "providers:manage",
    title: "Manage providers",
    description: "Configure, install, sign in to, and update providers and usage sources.",
  },
  {
    scope: "environment:maintain",
    title: "Maintain environment",
    description: "Update the server and control environment processes.",
  },
  {
    scope: "preview:operate",
    title: "Control previews",
    description: "Open browser previews and host browser automation.",
  },
  {
    scope: "diagnostics:read",
    title: "View diagnostics and usage",
    description: "Read process diagnostics, resource history, and usage totals.",
  },
  {
    scope: "terminal:read",
    title: "View terminals",
    description: "Read existing terminal output and status.",
  },
  {
    scope: "terminal:operate",
    title: "Use terminals",
    description: "Create terminals and send input to running shells.",
  },
  {
    scope: "source-control:write",
    title: "Change source control",
    description: "Commit, push, manage branches and repositories, and change pull requests.",
  },
  {
    scope: "filesystem:read",
    title: "Read files",
    description: "Browse host files, search workspaces, and inspect local changes.",
  },
  {
    scope: "filesystem:write",
    title: "Write files",
    description: "Edit workspace files and save plans to disk.",
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
