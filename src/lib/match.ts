import type { Keyword } from "#/db/schema";

/**
 * KEYWORD MATCHING
 * -----------------------------------------------------------------------------
 * Pure functions. The import pipeline runs these over the firehose in memory
 * and stores only matches, so editing a keyword's rules never rematches old
 * content.
 */

type Rules = Pick<Keyword, "term" | "aliases" | "include" | "exclude">;

/** Every surface form a keyword matches on: the canonical term plus aliases. */
export function matchTerms(keyword: Pick<Rules, "term" | "aliases">): string[] {
	return [keyword.term, ...keyword.aliases];
}

function escapeRegExp(term: string): string {
	return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive whole-word pattern matching any of `terms`. Manual
 * lookarounds instead of `\b` so terms ending in symbols ("C++") still get a
 * right-hand boundary.
 */
function termsPattern(terms: string[], flags: string): RegExp {
	const alternation = terms.map(escapeRegExp).join("|");
	return new RegExp(
		`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`,
		flags,
	);
}

function containsAny(text: string, terms: string[]): boolean {
	return termsPattern(terms, "iu").test(text);
}

/** Split text into runs, marking occurrences of any of `terms` for highlighting. */
export function splitOnTerms(
	text: string,
	terms: string[],
): { text: string; match?: boolean }[] {
	const runs: { text: string; match?: boolean }[] = [];
	let last = 0;
	for (const m of text.matchAll(termsPattern(terms, "giu"))) {
		if (m.index > last) runs.push({ text: text.slice(last, m.index) });
		runs.push({ text: m[0], match: true });
		last = m.index + m[0].length;
	}
	if (last < text.length) runs.push({ text: text.slice(last) });
	return runs;
}

function matchesKeyword(text: string, keyword: Rules): boolean {
	return (
		containsAny(text, matchTerms(keyword)) &&
		keyword.include.every((term) => containsAny(text, [term])) &&
		!keyword.exclude.some((term) => containsAny(text, [term]))
	);
}

export function matchKeywords<K extends Rules>(text: string, keywords: K[]) {
	return keywords.filter((keyword) => matchesKeyword(text, keyword));
}
