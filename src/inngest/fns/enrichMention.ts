import { eq } from "drizzle-orm";
import { db } from "#/db/client";
import { items } from "#/db/schema";
import { categorizer } from "#/lib/categorize";
import { applyCategorization, publishCategorized } from "../categorization";
import { inngest } from "../client";
import { mentionCreated } from "../events";

/* --- enrich-mention ----------------------------------------------------------
   Categorization behind the swappable `categorizer`. The shared write only
   fires while category IS NULL, so duplicate events are harmless. Limit 2
   because libsql has a single writer. */
export const enrichMention = inngest.createFunction(
	{
		id: "enrich-mention",
		triggers: [mentionCreated],
		concurrency: { limit: 2 },
	},
	async ({ event, step }) => {
		const { mentionId, itemId } = event.data;
		const result = await step.run("categorize", async () => {
			const [item] = await db
				.select({ title: items.title, bodyText: items.bodyText })
				.from(items)
				.where(eq(items.id, itemId));
			if (!item) {
				return { applied: false, category: null, reason: "item missing" };
			}

			const category = categorizer.categorize(item);
			const applied = await applyCategorization(mentionId, {
				category,
				categorizedBy: categorizer.id,
			});

			return { category, applied };
		});

		if (result.applied && result.category !== null) {
			await publishCategorized(step, mentionId, result.category);
		}

		return result;
	},
);
