import { and, eq, inArray, isNull } from "drizzle-orm";
import { cron, NonRetriableError } from "inngest";
import { db } from "#/db/client";
import {
	items,
	type Keyword,
	keywords,
	mentions,
	sourceCursors,
} from "#/db/schema";
import { categorizer } from "#/lib/categorize";
import { matchKeywords } from "#/lib/match";
import { adapters, getAdapter } from "#/sources";
import type { SourceItem } from "#/sources/types";
import { inngest } from "./client";
import { mentionCreated, sourceImportRequested } from "./events";

/**
 * THE IMPORT PIPELINE
 * -----------------------------------------------------------------------------
 * cron ─▶ schedule-imports ─▶ import.requested ─▶ import-source ─▶
 * mention.created ─▶ enrich-mention
 */

/** Chunks (adapter pages) walked per run; the next cron tick continues. */
const MAX_CHUNKS_PER_RUN = 20;

/* --- schedule-imports: cron fan-out, one import.requested per source. ----- */
export const scheduleImports = inngest.createFunction(
	{ id: "schedule-imports", triggers: [cron("*/15 * * * *")] },
	async ({ step }) => {
		const sources = Object.keys(adapters);
		await step.sendEvent(
			"fan-out",
			sources.map((source) => sourceImportRequested.create({ source })),
		);
		return { requested: sources.length };
	},
);

type MentionRef = { mentionId: string; itemId: string; keywordId: string };

/**
 * Upsert matched items and their mentions, returning a ref per mention.
 * Re-select rather than trust returning(): a conflict-skipped pair still has
 * a mention id we need to emit for.
 */
async function storeMatches(
	source: string,
	matched: { item: SourceItem; hits: Keyword[] }[],
): Promise<MentionRef[]> {
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
		return itemId ? hits.map((k) => ({ itemId, keywordId: k.id })) : [];
	});
	if (pairs.length === 0) return [];

	await db.insert(mentions).values(pairs).onConflictDoNothing();

	const wanted = new Set(pairs.map((p) => `${p.itemId}:${p.keywordId}`));
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
	return rows
		.filter((r) => wanted.has(`${r.itemId}:${r.keywordId}`))
		.map((r) => ({
			mentionId: r.id,
			itemId: r.itemId,
			keywordId: r.keywordId,
		}));
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

		let scanned = 0;
		let emitted = 0;

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

				await db
					.insert(sourceCursors)
					.values({ source, cursor: page.nextCursor })
					.onConflictDoUpdate({
						target: sourceCursors.source,
						set: { cursor: page.nextCursor, lastRunAt: new Date() },
					});

				return { scanned: page.items.length, refs, done: page.done };
			});

			scanned += result.scanned;
			emitted += result.refs.length;

			if (result.refs.length > 0) {
				await step.sendEvent(
					`emit-${chunk}`,
					result.refs.map((ref) =>
						mentionCreated.create(ref, {
							id: `mention.created/${ref.mentionId}`,
						}),
					),
				);
			}

			if (result.done) break;
		}

		return { source, scanned, mentionEvents: emitted };
	},
);

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
