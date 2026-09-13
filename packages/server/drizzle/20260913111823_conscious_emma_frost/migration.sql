CREATE TABLE `gateway_settings` (
	`id` integer PRIMARY KEY,
	`t3code_web_channel` text DEFAULT 'nightly' NOT NULL,
	`t3code_web_auto_update` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `gateway_settings` (`id`, `t3code_web_channel`, `t3code_web_auto_update`, `updated_at`)
VALUES (1, 'nightly', 0, '1970-01-01T00:00:00.000Z');
