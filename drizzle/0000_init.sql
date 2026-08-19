CREATE TABLE `keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`tag` text NOT NULL,
	`include` text DEFAULT '[]' NOT NULL,
	`exclude` text DEFAULT '[]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`keyword_id` text NOT NULL,
	`category` text,
	`categorized_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mentions_post_keyword` ON `mentions` (`post_id`,`keyword_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`source_parent_id` text,
	`type` text NOT NULL,
	`title` text,
	`author` text,
	`body_text` text,
	`url` text,
	`permalink` text NOT NULL,
	`posted_at` integer,
	`raw` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_source_source_id` ON `posts` (`source`,`source_id`);--> statement-breakpoint
CREATE TABLE `source_cursors` (
	`source` text PRIMARY KEY NOT NULL,
	`cursor` text NOT NULL,
	`last_run_at` integer NOT NULL
);
