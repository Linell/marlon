import { and, eq, isNull } from "drizzle-orm";
import type { Realtime } from "inngest";
import { db } from "#/db/client";
import { mentions } from "#/db/schema";
import { activityRealtime } from "./realtime";

/**
 * CATEGORIZATION WRITE + ANNOUNCE
 * -----------------------------------------------------------------------------
 * Every enrichment path (rules, LLM, LLM's no-key fallback) funnels through
 * these two helpers so the system's one idempotency invariant — the UPDATE
 * only fires while `category IS NULL` — and the activity-feed payload each
 * live in exactly one place.
 */

/** Terminal write for a mention. Returns whether this call won the race;
 *  a duplicate event sees a non-null category and applies nothing. */
export async function applyCategorization(
	mentionId: string,
	fields: {
		category: string;
		categorizedBy: string;
		disposition?: "not_a_match" | null;
		enrichRunId?: string;
	},
): Promise<boolean> {
	const updated = await db
		.update(mentions)
		.set(fields)
		.where(and(eq(mentions.id, mentionId), isNull(mentions.category)))
		.returning({ id: mentions.id });
	return updated.length > 0;
}

/** The slice of step tools we need, so any function's `step` fits. */
type RealtimeStep = {
	realtime: {
		publish: <TData>(
			id: string,
			topicRef: Realtime.TopicRef<TData>,
			data: TData,
		) => Promise<TData>;
	};
};

export async function publishCategorized(
	step: RealtimeStep,
	mentionId: string,
	category: string,
): Promise<void> {
	await step.realtime.publish(
		`activity-mention-categorized-${mentionId}`,
		activityRealtime["mention.categorized"],
		{ mentionId, category },
	);
}
