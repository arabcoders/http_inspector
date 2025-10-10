DROP INDEX `token_id_idx`;--> statement-breakpoint
ALTER TABLE `tokens` ADD `friendly_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tokens_friendly_id_unique` ON `tokens` (`friendly_id`);--> statement-breakpoint
CREATE INDEX `token_friendly_id_idx` ON `tokens` (`friendly_id`);