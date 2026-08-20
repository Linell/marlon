CREATE TABLE `views` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`keyword_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
