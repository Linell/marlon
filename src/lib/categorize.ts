import type { Category } from "#/components/ui/registry";

/**
 * MENTION CATEGORIZATION
 * -----------------------------------------------------------------------------
 * The enrichment step calls whatever `categorizer` points at, and writes its
 * `id` into `mentions.categorized_by`. Swapping rules for an LLM later is one
 * new object with this shape and one reassignment.
 */

export type Categorizer = {
	/** Recorded in `mentions.categorized_by` so runs stay attributable. */
	id: string;
	categorize(input: {
		title: string | null;
		bodyText: string | null;
	}): Category;
};

const PATTERNS: Array<[Category, RegExp]> = [
	// A question mark is the strongest actionable signal the team has.
	// End-of-word only, so URL query strings don't count.
	["question", /\?(\s|$)/],
	[
		"request",
		/\b(feature request|would be (nice|great|cool)|wish (it|there|they)|please add|any plans? (to|for)|support for)\b/i,
	],
	[
		"complaint",
		/\b(broken|buggy|frustrat\w*|annoying|terrible|awful|unusable|disappointing|regression|crash\w*|keeps? failing)\b/i,
	],
	[
		"praise",
		/\b(love|loving|loved|awesome|amazing|excellent|fantastic|brilliant|impressed|great (tool|product|work|experience)|works? great)\b/i,
	],
];

const rules: Categorizer = {
	id: "rules",
	categorize({ title, bodyText }) {
		const text = [title, bodyText].filter(Boolean).join("\n");
		for (const [category, pattern] of PATTERNS) {
			if (pattern.test(text)) return category;
		}
		return "discussion";
	},
};

/** The active implementation. Point this at an LLM categorizer someday. */
export const categorizer: Categorizer = rules;
