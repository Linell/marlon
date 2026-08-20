import type { Keyword } from "#/db/schema";

/**
 * KEYWORD MATCHING
 * -----------------------------------------------------------------------------
 * Pure functions. The import pipeline runs these over the firehose in memory
 * and stores only matches, so editing a keyword's rules never rematches old
 * content.
 */

type Rules = Pick<Keyword, "term" | "include" | "exclude">;

/**
 * Case-insensitive whole-word pattern. Manual lookarounds instead of `\b`
 * so terms ending in symbols ("C++") still get a right-hand boundary.
 */
function termPattern(term: string, flags: string): RegExp {
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags);
}

function contains(text: string, term: string): boolean {
	return termPattern(term, "iu").test(text);
}

/** Split text into runs, marking occurrences of `term` for highlighting. */
export function splitOnTerm(
	text: string,
	term: string,
): { text: string; match?: boolean }[] {
	const runs: { text: string; match?: boolean }[] = [];
	let last = 0;
	for (const m of text.matchAll(termPattern(term, "giu"))) {
		if (m.index > last) runs.push({ text: text.slice(last, m.index) });
		runs.push({ text: m[0], match: true });
		last = m.index + m[0].length;
	}
	if (last < text.length) runs.push({ text: text.slice(last) });
	return runs;
}

function matchesKeyword(text: string, keyword: Rules): boolean {
	return (
		contains(text, keyword.term) &&
		keyword.include.every((term) => contains(text, term)) &&
		!keyword.exclude.some((term) => contains(text, term))
	);
}

export function matchKeywords<K extends Rules>(text: string, keywords: K[]) {
	return keywords.filter((keyword) => matchesKeyword(text, keyword));
}
