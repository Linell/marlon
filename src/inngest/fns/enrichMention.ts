import { and, eq, isNull } from "drizzle-orm";
import { db } from "#/db/client";
import { items, mentions } from "#/db/schema";
import { categorizer } from "#/lib/categorize";
import { inngest } from "../client";
import { mentionCreated } from "../events";

/* --- enrich-mention ----------------------------------------------------------
   Categorization behind the swappable `categorizer`. The UPDATE only fires
   while category IS NULL, so duplicate events are harmless. Limit 2 because
   libsql has a single writer. */
export const enrichMention = inngest.createFunction(
	{
		id: "enrich-mention",
		triggers: [mentionCreated],
		concurrency: { limit: 2 },
	},
	async ({ event, step }) => {
		const { mentionId, itemId } = event.data;
		return step.run("categorize", async () => {
			const [item] = await db
				.select({ title: items.title, bodyText: items.bodyText })
				.from(items)
				.where(eq(items.id, itemId));
			if (!item) return { applied: false, reason: "item missing" };

			const category = categorizer.categorize(item);
			const updated = await db
				.update(mentions)
				.set({ category, categorizedBy: categorizer.id })
				.where(and(eq(mentions.id, mentionId), isNull(mentions.category)))
				.returning({ id: mentions.id });

			return { category, applied: updated.length > 0 };
		});
	},
);
