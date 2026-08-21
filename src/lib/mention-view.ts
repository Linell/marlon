import type { MentionData } from "#/components/ui/Mention";
import type { Category, Tag } from "#/components/ui/registry";
import type { MentionRow, ViewMentionRow } from "#/functions/mentions";
import { matchTerms, splitOnTerms } from "#/lib/match";

/**
 * MENTION VIEW HELPERS
 * -----------------------------------------------------------------------------
 * Pure mapping from server mention rows to the `MentionData` the Mention
 * component renders, shared by the home feed and view detail pages.
 */

export function timeAgo(date: Date, now = Date.now()): string {
	const minutes = Math.floor((now - date.getTime()) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

export function asDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null;
	if (value instanceof Date) return value;
	return new Date(value);
}

/** Whichever field the keyword actually matched, so the highlight shows. */
function matchedBody(row: MentionRow, terms: string[]): string {
	const [primary, secondary] =
		row.type === "comment"
			? [row.bodyText, row.title]
			: [row.title, row.bodyText];
	for (const text of [primary, secondary]) {
		if (text && splitOnTerms(text, terms).some((run) => run.match)) {
			return text;
		}
	}
	return primary ?? secondary ?? "";
}

export function toMentionData(row: MentionRow): MentionData {
	const terms = matchTerms(row);
	return {
		id: row.id,
		source: row.source,
		type: row.type === "comment" ? "comment" : "story",
		author: row.author ?? "unknown",
		body: splitOnTerms(matchedBody(row, terms), terms),
		keyword: row.term,
		matchTerms: terms,
		keywordTag: row.tag as Tag,
		category: row.category as Category | null,
		at: timeAgo(row.postedAt ?? row.createdAt),
		url: row.url ?? undefined,
		permalink: row.permalink,
		thread:
			row.threadTitle && row.threadPermalink
				? { title: row.threadTitle, href: row.threadPermalink }
				: undefined,
	};
}

/** A deduped view-feed row highlights and credits every keyword it matched. */
export function toViewMentionData(row: ViewMentionRow): MentionData {
	const terms = [...new Set(row.matches.flatMap(matchTerms))];
	return {
		...toMentionData(row),
		body: splitOnTerms(matchedBody(row, terms), terms),
		matchTerms: terms,
		matches: row.matches.map(({ term, tag }) => ({ term, tag: tag as Tag })),
	};
}
