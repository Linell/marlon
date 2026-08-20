import { getSubscriptionToken } from "@inngest/realtime";
import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { db } from "#/db/client";
import { importRuns } from "#/db/schema";
import { inngest } from "#/inngest/client";
import { activityRealtime, activityTopics } from "#/inngest/realtime";

export const mintActivitySubscriptionToken = createServerFn().handler(async () => {
	const token = await getSubscriptionToken(inngest, {
		channel: activityRealtime.name,
		topics: [...activityTopics],
	});

	return {
		channel: activityRealtime.name,
		topics: [...activityTopics],
		key: token.key,
	};
});

export const getImportActivity = createServerFn().handler(async () => {
	const recentRuns = await db
		.select()
		.from(importRuns)
		.orderBy(desc(importRuns.startedAt))
		.limit(20);

	const lastRun = recentRuns.find((run) => run.completedAt !== null) ?? null;

	return {
		recentRuns,
		lastRunSummary: lastRun
			? {
				source: lastRun.source,
				completedAt: lastRun.completedAt,
				itemsChecked: lastRun.itemsChecked,
				matchCount: lastRun.matchCount,
			}
			: null,
	};
});

export type ImportActivityPayload = Awaited<ReturnType<typeof getImportActivity>>;
