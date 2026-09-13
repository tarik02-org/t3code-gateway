CREATE TABLE `gateway_settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `gateway_settings` (`key`, `value`, `updated_at`)
VALUES
	('t3code.web.updateChannel', 'nightly', '1970-01-01T00:00:00.000Z'),
	('t3code.web.autoUpdate', 'false', '1970-01-01T00:00:00.000Z'),
	('t3code.web.autoGc', 'false', '1970-01-01T00:00:00.000Z'),
	('t3code.web.keepRecent.stable', '2', '1970-01-01T00:00:00.000Z'),
	('t3code.web.keepRecent.nightly', '2', '1970-01-01T00:00:00.000Z'),
	('t3code.web.pinned.stable', '', '1970-01-01T00:00:00.000Z'),
	('t3code.web.pinned.nightly', '', '1970-01-01T00:00:00.000Z');
