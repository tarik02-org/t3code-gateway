CREATE TABLE `mcp_upstream_credentials` (
	`environment_id` text NOT NULL,
	`access` text NOT NULL,
	`token_encrypted` blob,
	`session_id` text,
	`expires_at` text,
	`last_attempt_at` text,
	`last_failure` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `mcp_upstream_credentials_pk` PRIMARY KEY(`environment_id`, `access`),
	CONSTRAINT `fk_mcp_upstream_credentials_environment_id_environments_environment_id_fk` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`environment_id`) ON DELETE CASCADE
);
