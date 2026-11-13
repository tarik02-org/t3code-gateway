CREATE TABLE `environment_client_sessions` (
	`environment_id` text PRIMARY KEY,
	`sessions_json` text NOT NULL,
	`synced_at` text NOT NULL,
	CONSTRAINT `fk_environment_client_sessions_environment_id_environments_environment_id_fk` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`environment_id`) ON DELETE CASCADE
);
