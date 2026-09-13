import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
