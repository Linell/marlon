ALTER TABLE `posts` RENAME TO `items`;--> statement-breakpoint
ALTER TABLE `mentions` RENAME COLUMN "post_id" TO "item_id";--> statement-breakpoint
DROP INDEX `posts_source_source_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `items_source_source_id` ON `items` (`source`,`source_id`);--> statement-breakpoint
DROP INDEX `mentions_post_keyword`;--> statement-breakpoint
CREATE UNIQUE INDEX `mentions_item_keyword` ON `mentions` (`item_id`,`keyword_id`);--> statement-breakpoint
ALTER TABLE `mentions` ALTER COLUMN "item_id" TO "item_id" text NOT NULL REFERENCES items(id) ON DELETE cascade ON UPDATE no action;