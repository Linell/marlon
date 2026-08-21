import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { db } from "#/db/client";
import { items, keywords, mentions } from "#/db/schema";

/**
 * MENTION SERVER FUNCTIONS
 * -----------------------------------------------------------------------------
 * Read side of the pipeline: one flat row per mention, joined to its item and
 * the keyword that surfaced it.
 */

const mentionSelect = {
	id: mentions.id,
	itemId: mentions.itemId,
	category: mentions.category,
	createdAt: mentions.createdAt,
	source: items.source,
	type: items.type,
	title: items.title,
	bodyText: items.bodyText,
	author: items.author,
	permalink: items.permalink,
	threadTitle: items.threadTitle,
	threadPermalink: items.threadPermalink,
	postedAt: items.postedAt,
	term: keywords.term,
	aliases: keywords.aliases,
	tag: keywords.tag,
};

/* NULL disposition = real match; "not_a_match" = LLM-rejected. Rejected rows
   stay stored for scoring but must never reach feeds or charts — they are the
   false positives this filter exists to remove. */
const notRejected = isNull(mentions.disposition);

/* Every feed reads through here, so the rejection filter can't be forgotten
   by a new caller. The timeseries aggregates below don't use this builder and
   apply `notRejected` themselves. */
function mentionsQuery(where?: SQL) {
	return db
		.select(mentionSelect)
		.from(mentions)
		.innerJoin(items, eq(mentions.itemId, items.id))
		.innerJoin(keywords, eq(mentions.keywordId, keywords.id))
		.where(where ? and(notRejected, where) : notRejected);
}

/** Normalize an id list: trim, drop empties, dedupe, cap. */
function cleanIds(value: unknown, cap: number): string[] {
	if (!Array.isArray(value)) throw new Error("Expected an array of ids");

	const seen = new Set<string>();
	const out: string[] = [];

	for (const item of value) {
		if (typeof item !== "string") continue;
		const id = item.trim();
		if (id.length === 0 || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
		if (out.length >= cap) break;
	}

	return out;
}

function validateMentionIds(data: unknown): { ids: string[] } {
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected { ids: string[] }");
	}
	return { ids: cleanIds((data as Record<string, unknown>).ids, 100) };
}

function validateKeywordIds(data: unknown): { keywordIds: string[] } {
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected { keywordIds: string[] }");
	}
	return {
		keywordIds: cleanIds((data as Record<string, unknown>).keywordIds, 100),
	};
}

export const listMentions = createServerFn().handler(async () => {
	return mentionsQuery().orderBy(desc(mentions.createdAt)).limit(100);
});

export const listMentionsByIds = createServerFn({ method: "POST" })
	.validator(validateMentionIds)
	.handler(async ({ data }) => {
		if (data.ids.length === 0) return [];

		return mentionsQuery(inArray(mentions.id, data.ids)).orderBy(
			desc(mentions.createdAt),
		);
	});

export type MentionRow = Awaited<ReturnType<typeof listMentions>>[number];

/* --- View feed -----------------------------------------------------------------
   Mentions across a set of keywords, deduped by item: an item matched by two
   member keywords renders once, carrying every keyword that matched it. */

type MentionMatch = { term: string; tag: string; aliases: string[] };

function dedupeByItem(
	rows: MentionRow[],
): Array<MentionRow & { matches: MentionMatch[] }> {
	const byItem = new Map<string, MentionRow & { matches: MentionMatch[] }>();
	for (const row of rows) {
		const match = { term: row.term, tag: row.tag, aliases: row.aliases };
		const existing = byItem.get(row.itemId);
		if (existing) existing.matches.push(match);
		else byItem.set(row.itemId, { ...row, matches: [match] });
	}
	return [...byItem.values()];
}

export const listMentionsForKeywords = createServerFn({ method: "POST" })
	.validator(validateKeywordIds)
	.handler(async ({ data }) => {
		if (data.keywordIds.length === 0) return [];

		const rows = await mentionsQuery(
			inArray(mentions.keywordId, data.keywordIds),
		).orderBy(desc(mentions.createdAt));

		return dedupeByItem(rows).slice(0, 100);
	});

export type ViewMentionRow = Awaited<
	ReturnType<typeof listMentionsForKeywords>
>[number];

/* --- Timeseries ------------------------------------------------------------------
   Chart-ready mention volume over a fixed 30-day window: one count per day per
   keyword, zero-filled and ascending, never sparse. `total` counts distinct
   items across all keywords per day, so it reconciles with the deduped feed
   rather than summing the per-keyword series.

   The repo's only raw drizzle `sql` lives here: `posted_at`/`created_at` are
   unix-SECONDS integers, so days bucket with date(..., 'unixepoch'). Items
   fall back to the mention's import time when the source gave no post time. */

const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

function windowDates(): string[] {
	const start = new Date();
	start.setUTCHours(0, 0, 0, 0);
	start.setUTCDate(start.getUTCDate() - (WINDOW_DAYS - 1));
	return Array.from({ length: WINDOW_DAYS }, (_, i) =>
		new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10),
	);
}

export const getMentionTimeseries = createServerFn({ method: "POST" })
	.validator(validateKeywordIds)
	.handler(async ({ data }) => {
		const dates = windowDates();
		const zeroes = () => dates.map(() => 0);
		if (data.keywordIds.length === 0) {
			return { dates, series: [], total: zeroes() };
		}

		const members = await db
			.select({ id: keywords.id, term: keywords.term })
			.from(keywords)
			.where(inArray(keywords.id, data.keywordIds));
		const byId = new Map(members.map((k) => [k.id, k]));
		// Preserve caller order; drop ids of since-deleted keywords.
		const ordered = data.keywordIds
			.map((id) => byId.get(id))
			.filter((k) => k !== undefined);
		if (ordered.length === 0) return { dates, series: [], total: zeroes() };

		const ids = ordered.map((k) => k.id);
		const day = sql<string>`date(coalesce(${items.postedAt}, ${mentions.createdAt}), 'unixepoch')`;
		const windowStart = Math.floor(Date.parse(`${dates[0]}T00:00:00Z`) / 1000);
		const inWindow = and(
			inArray(mentions.keywordId, ids),
			notRejected,
			sql`coalesce(${items.postedAt}, ${mentions.createdAt}) >= ${windowStart}`,
		);

		const [perKeyword, perDay] = await Promise.all([
			db
				.select({
					keywordId: mentions.keywordId,
					day,
					count: sql<number>`count(*)`,
				})
				.from(mentions)
				.innerJoin(items, eq(mentions.itemId, items.id))
				.where(inWindow)
				.groupBy(mentions.keywordId, day),
			db
				.select({ day, count: sql<number>`count(distinct ${mentions.itemId})` })
				.from(mentions)
				.innerJoin(items, eq(mentions.itemId, items.id))
				.where(inWindow)
				.groupBy(day),
		]);

		const dayIndex = new Map(dates.map((date, i) => [date, i]));
		const counts = new Map(ids.map((id) => [id, zeroes()]));
		for (const row of perKeyword) {
			const i = dayIndex.get(row.day);
			const series = counts.get(row.keywordId);
			if (i !== undefined && series) series[i] = row.count;
		}

		const total = zeroes();
		for (const row of perDay) {
			const i = dayIndex.get(row.day);
			if (i !== undefined) total[i] = row.count;
		}

		return {
			dates,
			series: ordered.map((k) => ({
				keywordId: k.id,
				term: k.term,
				counts: counts.get(k.id) ?? zeroes(),
			})),
			total,
		};
	});

export type MentionTimeseries = Awaited<
	ReturnType<typeof getMentionTimeseries>
>;
