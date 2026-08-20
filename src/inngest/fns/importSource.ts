import { and, eq, inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { db } from "#/db/client";
import {
	importRuns,
	items,
	type Keyword,
	keywords,
	mentions,
	sourceCursors,
} from "#/db/schema";
import { matchKeywords } from "#/lib/match";
import { getAdapter } from "#/sources";
import type { SourceItem } from "#/sources/types";
import { inngest } from "../client";
import { mentionCreated, sourceImportRequested } from "../events";
import { activityRealtime } from "../realtime";

/** Chunks (adapter pages) walked per run; the next cron tick continues. */
const MAX_CHUNKS_PER_RUN = 20;

type MentionRef = { mentionId: string; itemId: string; keywordId: string };
type MatchFound = MentionRef & { keyword: string; title: string };

function tickerTitle(item: SourceItem): string {
	const raw = item.title ?? item.threadTitle ?? item.bodyText ?? item.permalink;
	const compact = raw.replace(/\s+/g, " ").trim();
	if (compact.length <= 120) return compact;
	return `${compact.slice(0, 117)}...`;
}

/**
 * Upsert matched items and their mentions, returning a ref per mention.
 * Re-select rather than trust returning(): a conflict-skipped pair still has
 * a mention id we need to emit for.
 */
async function storeMatches(
	source: string,
	matched: { item: SourceItem; hits: Keyword[] }[],
): Promise<MatchFound[]> {
	if (matched.length === 0) return [];

	await db
		.insert(items)
		.values(matched.map(({ item }) => item))
		.onConflictDoNothing();

	const stored = await db
		.select({ id: items.id, sourceId: items.sourceId })
		.from(items)
		.where(
			and(
				eq(items.source, source),
				inArray(
					items.sourceId,
					matched.map(({ item }) => item.sourceId),
				),
			),
		);
	const idBySourceId = new Map(stored.map((s) => [s.sourceId, s.id]));

	const pairs = matched.flatMap(({ item, hits }) => {
		const itemId = idBySourceId.get(item.sourceId);
		const title = tickerTitle(item);
		return itemId
			? hits.map((k) => ({
					itemId,
					keywordId: k.id,
					keyword: k.term,
					title,
				}))
			: [];
	});
	if (pairs.length === 0) return [];

	await db
		.insert(mentions)
		.values(pairs.map(({ itemId, keywordId }) => ({ itemId, keywordId })))
		.onConflictDoNothing();

	const metaByPair = new Map(
		pairs.map((pair) => [
			`${pair.itemId}:${pair.keywordId}`,
			{ keyword: pair.keyword, title: pair.title },
		]),
	);
	const rows = await db
		.select({
			id: mentions.id,
			itemId: mentions.itemId,
			keywordId: mentions.keywordId,
		})
		.from(mentions)
		.where(
			inArray(
				mentions.itemId,
				pairs.map((p) => p.itemId),
			),
		);

	const out: MatchFound[] = [];
	for (const row of rows) {
		const key = `${row.itemId}:${row.keywordId}`;
		const meta = metaByPair.get(key);
		if (!meta) continue;
		out.push({
			mentionId: row.id,
			itemId: row.itemId,
			keywordId: row.keywordId,
			keyword: meta.keyword,
			title: meta.title,
		});
	}

	return out;
}

/* --- import-source -----------------------------------------------------------
   The whole walk for one source. `singleton` with mode "skip" collapses
   overlapping runs (a slow walk + the next cron tick) instead of queueing
   them; a skipped tick loses nothing because every run resumes from the
   stored cursor.

   Two sibling steps per chunk, because `step.*` can't nest inside `step.run`:
   `chunk-N` fetches, matches, and upserts, returning only counts, refs, and
   the cursor (step returns serialize; limits are 4MiB/step, 32MiB/run, 1000
   steps/run). `emit-N` then sends the mention.created events. */
export const importSource = inngest.createFunction(
	{
		id: "import-source",
		triggers: [sourceImportRequested],
		singleton: { key: "event.data.source", mode: "skip" },
		onFailure: async ({ event, error, logger }) => {
			logger.error(
				`import-source stuck for source "${event.data.event.data.source}"`,
				error,
			);
		},
	},
	async ({ event, step }) => {
		const source = event.data.source;
		const adapter = getAdapter(source);
		if (!adapter) {
			throw new NonRetriableError(`No adapter registered for "${source}"`);
		}

		const startedAt = new Date();
		await step.realtime.publish(
			"activity-started",
			activityRealtime["import.started"],
			{ source },
		);

		let scanned = 0;
		let matchCount = 0;

		for (let chunk = 0; chunk < MAX_CHUNKS_PER_RUN; chunk++) {
			const result = await step.run(`chunk-${chunk}`, async () => {
				const [row] = await db
					.select()
					.from(sourceCursors)
					.where(eq(sourceCursors.source, source));
				const cursor = row?.cursor ?? (await adapter.seedCursor());

				const active = await db
					.select()
					.from(keywords)
					.where(eq(keywords.active, true));

				const page = await adapter.fetchPage(cursor);

				// item → keywords it mentions; non-matches are dropped.
				const matched = page.items
					.map((item) => ({
						item,
						hits: matchKeywords(
							[item.title, item.bodyText].filter(Boolean).join("\n"),
							active,
						),
					}))
					.filter(({ hits }) => hits.length > 0);

				// Thread context only for matches — extra requests per hit, not
				// per scanned item. A failed walk just leaves the context null.
				if (adapter.resolveThread) {
					for (const { item } of matched) {
						if (item.sourceParentId == null) continue;
						const root = await adapter.resolveThread(item).catch(() => null);
						if (root) {
							item.threadTitle = root.title;
							item.threadPermalink = root.permalink;
						}
					}
				}

				const refs = await storeMatches(source, matched);
				const titles = page.items.map(tickerTitle);

				await db
					.insert(sourceCursors)
					.values({ source, cursor: page.nextCursor })
					.onConflictDoUpdate({
						target: sourceCursors.source,
						set: { cursor: page.nextCursor, lastRunAt: new Date() },
					});

				return { scanned: page.items.length, refs, titles, done: page.done };
			});

			scanned += result.scanned;
			matchCount += result.refs.length;

			await step.realtime.publish(
				`activity-progress-${chunk}`,
				activityRealtime["import.progress"],
				{
					source,
					itemsChecked: result.scanned,
					matchCount: result.refs.length,
					titles: result.titles,
				},
			);

			for (const ref of result.refs) {
				await step.realtime.publish(
					`activity-match-${ref.mentionId}`,
					activityRealtime["match.found"],
					{ keyword: ref.keyword, title: ref.title },
				);
			}

			if (result.refs.length > 0) {
				await step.sendEvent(
					`emit-${chunk}`,
					result.refs.map(({ mentionId, itemId, keywordId }) =>
						mentionCreated.create({ mentionId, itemId, keywordId }, {
							id: `mention.created/${mentionId}`,
						}),
					),
				);
			}

			if (result.done) break;
		}

		const completedAt = new Date();
		await step.run("store-import-run", async () => {
			await db.insert(importRuns).values({
				source,
				startedAt,
				completedAt,
				itemsChecked: scanned,
				matchCount,
			});
		});

		await step.realtime.publish(
			"activity-completed",
			activityRealtime["import.completed"],
			{
				source,
				totalChecked: scanned,
				totalMatches: matchCount,
			},
		);

		return { source, scanned, mentionEvents: matchCount };
	},
);
