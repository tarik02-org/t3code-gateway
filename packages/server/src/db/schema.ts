import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { McpAccess, McpGrantKind } from "@t3code-gateway/contracts/schemas";

export const gatewaySettings = sqliteTable("gateway_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  passwordChangedAt: text("password_changed_at"),
});

export const userSessions = sqliteTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionTokenHash: text("session_token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const environments = sqliteTable("environments", {
  environmentId: text("environment_id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  endpoint: text("endpoint").notNull(),
  descriptorJson: text("descriptor_json"),
  browserTokenScopesJson: text("browser_token_scopes_json").notNull(),
  adminTokenEncrypted: blob("admin_token_encrypted", { mode: "buffer" }).notNull(),
  adminTokenExpiresAt: text("admin_token_expires_at"),
  adminTokenLastCheckedAt: text("admin_token_last_checked_at"),
  adminTokenFailureJson: text("admin_token_failure_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** The gateway's own `mcp-client` sign-in to an environment, one per access level a relay grant uses. */
export const mcpUpstreamCredentials = sqliteTable(
  "mcp_upstream_credentials",
  {
    environmentId: text("environment_id")
      .notNull()
      .references(() => environments.environmentId, { onDelete: "cascade" }),
    access: text("access").$type<McpAccess>().notNull(),
    tokenEncrypted: blob("token_encrypted", { mode: "buffer" }),
    sessionId: text("session_id"),
    expiresAt: text("expires_at"),
    lastAttemptAt: text("last_attempt_at"),
    lastFailure: text("last_failure"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.environmentId, table.access] })],
);

/** What one relay client may do through the gateway's `/mcp`. */
export const mcpGrants = sqliteTable("mcp_grants", {
  grantId: text("grant_id").primaryKey(),
  kind: text("kind").$type<McpGrantKind>().notNull(),
  label: text("label").notNull(),
  access: text("access").$type<McpAccess>().notNull(),
  /** JSON array of environment ids; `null` reaches every environment. */
  environmentIdsJson: text("environment_ids_json"),
  /** The OAuth client the grant was approved for; `null` for gateway tokens. */
  clientId: text("client_id"),
  createdByUserId: text("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
  expiresAt: text("expires_at"),
});

/** Bearer credentials for a grant, stored as SHA-256 hashes. */
export const mcpTokens = sqliteTable("mcp_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  grantId: text("grant_id")
    .notNull()
    .references(() => mcpGrants.grantId, { onDelete: "cascade" }),
  /** Only access tokens open `/mcp`; refresh tokens only reach the OAuth token endpoint. */
  kind: text("kind").$type<"access" | "refresh">().notNull(),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
});
