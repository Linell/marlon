ALTER TABLE `keywords` ADD `llm_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `mentions` ADD `disposition` text;--> statement-breakpoint
ALTER TABLE `mentions` ADD `enrich_run_id` text;