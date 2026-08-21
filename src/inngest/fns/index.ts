import { categoryJudge } from "./categoryJudge";
import { enrichMention } from "./enrichMention";
import { importSource } from "./importSource";
import { llmCategorize } from "./llmCategorize";
import { scheduleImports } from "./scheduleImports";

/**
 * THE IMPORT PIPELINE
 * -----------------------------------------------------------------------------
 * cron ─▶ schedule-imports ─▶ import.requested ─▶ import-source ─▶
 *   mention.created      ─▶ enrich-mention            (rules keywords)
 *   mention.created.llm  ─▶ llm-categorize ─▶ ⏳ category-judge (1-in-5 defer)
 *
 * `categoryJudge` must be registered here even though nothing triggers it
 * directly — an unregistered defer target fails silently.
 */
export const functions = [
	scheduleImports,
	importSource,
	enrichMention,
	llmCategorize,
	categoryJudge,
];

export {
	categoryJudge,
	enrichMention,
	importSource,
	llmCategorize,
	scheduleImports,
};
