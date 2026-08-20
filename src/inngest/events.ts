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
