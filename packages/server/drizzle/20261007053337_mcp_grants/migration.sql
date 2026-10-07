CREATE TABLE `mcp_grants` (
	`grant_id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`access` text NOT NULL,
	`environment_ids_json` text,
	`client_id` text,
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	CONSTRAINT `fk_mcp_grants_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_tokens` (
	`token_hash` text PRIMARY KEY,
	`grant_id` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT `fk_mcp_tokens_grant_id_mcp_grants_grant_id_fk` FOREIGN KEY (`grant_id`) REFERENCES `mcp_grants`(`grant_id`) ON DELETE CASCADE
);
