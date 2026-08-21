import { eventType, staticSchema } from "inngest";

/**
 * Asks import-source to walk one source. No event id: a deterministic id
 * would suppress later cron ticks for the 24h dedup window; overlapping runs
 * are handled by import-source's singleton instead.
 */
export const sourceImportRequested = eventType(
	"marlon/source.import.requested",
	{ schema: staticSchema<{ source: string }>() },
);

/**
 * Sent per stored (item × keyword) mention, always with the deterministic id
 * `mention.created/${mentionId}`, so re-emits from a re-walked chunk are
 * deduped for 24h.
 */
export const mentionCreated = eventType("marlon/mention.created", {
	schema: staticSchema<{
		mentionId: string;
		itemId: string;
		keywordId: string;
	}>(),
});

/**
 * The LLM-categorization route for keywords with `llmEnabled`. A distinct
 * event rather than a flag on `mentionCreated` because trigger `if`
 * expressions can't see DB fields; import-source holds the keyword row at
 * emit time and picks the event there. Same payload and deterministic-id
 * scheme as `mentionCreated`.
 */
export const mentionCreatedLlm = eventType("marlon/mention.created.llm", {
	schema: staticSchema<{
		mentionId: string;
		itemId: string;
		keywordId: string;
	}>(),
});
