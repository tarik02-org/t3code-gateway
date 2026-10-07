import type { McpAccess } from "@t3code-gateway/contracts/schemas";

export const DEFAULT_MCP_ACCESS: McpAccess = "auto";

/** Access levels as T3 Code enforces them, least to most. */
export const MCP_ACCESS_OPTIONS: ReadonlyArray<{
  readonly access: McpAccess;
  readonly title: string;
  readonly description: string;
}> = [
  {
    access: "read-only",
    title: "Read only",
    description: "Read threads, projects and settings. Cannot send or start anything.",
  },
  {
    access: "approval-required",
    title: "Approval required",
    description: "Act on threads that ask before every action.",
  },
  {
    access: "auto-accept-edits",
    title: "Auto-accept edits",
    description: "Act on threads that edit files without asking.",
  },
  {
    access: "auto",
    title: "Auto",
    description: "Act on threads that run without asking, within their sandbox.",
  },
  {
    access: "full-access",
    title: "Full access",
    description: "Act on any thread, and create, change or delete projects.",
  },
];

export const mcpAccessTitle = (access: McpAccess) =>
  MCP_ACCESS_OPTIONS.find((option) => option.access === access)?.title ?? access;
