ALTER TABLE `environments` ADD `admin_token_expires_at` text;--> statement-breakpoint
ALTER TABLE `environments` ADD `admin_token_last_checked_at` text;--> statement-breakpoint
ALTER TABLE `environments` ADD `admin_token_failure_json` text;