CREATE TABLE `import_runs` (
	`source` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`items_checked` integer DEFAULT 0 NOT NULL,
	`match_count` integer DEFAULT 0 NOT NULL
);
