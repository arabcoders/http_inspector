CREATE TABLE `key_value_store` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_id` text NOT NULL,
	`session_id` text NOT NULL,
	`method` text NOT NULL,
	`url` text NOT NULL,
	`headers` text NOT NULL,
	`body` blob,
	`content_type` text NOT NULL,
	`content_length` integer DEFAULT 0 NOT NULL,
	`is_binary` integer NOT NULL,
	`client_ip` text NOT NULL,
	`remote_ip` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`token_id`) REFERENCES `tokens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `request_token_idx` ON `requests` (`token_id`);--> statement-breakpoint
CREATE INDEX `request_session_idx` ON `requests` (`session_id`);--> statement-breakpoint
CREATE INDEX `request_created_idx` ON `requests` (`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`friendly_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_accessed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_friendly_id_unique` ON `sessions` (`friendly_id`);--> statement-breakpoint
CREATE INDEX `friendly_id_idx` ON `sessions` (`friendly_id`);--> statement-breakpoint
CREATE INDEX `last_accessed_idx` ON `sessions` (`last_accessed_at`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`response_enabled` integer DEFAULT false NOT NULL,
	`response_status` integer DEFAULT 200 NOT NULL,
	`response_headers` text,
	`response_body` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `token_session_idx` ON `tokens` (`session_id`);--> statement-breakpoint
CREATE INDEX `token_created_idx` ON `tokens` (`created_at`);