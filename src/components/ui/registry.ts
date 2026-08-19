/**
 * DOMAIN TOKEN REGISTRIES
 * -----------------------------------------------------------------------------
 * Every domain enum in Marlon (source, keyword tag, auto-category, job status)
 * gets one entry here mapping it to a label plus the Tailwind classes built
 * from its token. Components read the registry; they never hardcode a color.
 *
 * Adding a platform is a three-step change, all of it mechanical:
 *   1. tokens.css     — add `--source-bluesky`
 *   2. theme.css      — add `--color-source-bluesky: var(--source-bluesky)`
 *   3. this file      — add a SOURCES entry
 *
 * Class strings are written out in full and never assembled by interpolation,
 * because Tailwind only emits utilities it can find as literal text in source.
 */

export type Registered = {
	/** Human-facing name. */
	label: string;
	/** Short mono code for dense rows and column cells. */
	code: string;
	/** Foreground + hairline border, for outline-style chips. */
	chip: string;
	/** Bare foreground, for dots, icons, and inline accents. */
	fg: string;
};

/* --- Sources ---------------------------------------------------------------
   HN ships first; the rest are declared now so the UI has no gaps as they
   land. `unknown` is the fallback so an unrecognized source still renders. */
export const SOURCES = {
	hackernews: {
		label: "Hacker News",
		code: "HN",
		chip: "text-source-hackernews border-source-hackernews/35 bg-source-hackernews/10",
		fg: "text-source-hackernews",
	},
	linkedin: {
		label: "LinkedIn",
		code: "LI",
		chip: "text-source-linkedin border-source-linkedin/35 bg-source-linkedin/10",
		fg: "text-source-linkedin",
	},
	x: {
		label: "X",
		code: "X",
		chip: "text-source-x border-source-x/25 bg-source-x/10",
		fg: "text-source-x",
	},
	reddit: {
		label: "Reddit",
		code: "RD",
		chip: "text-source-reddit border-source-reddit/35 bg-source-reddit/10",
		fg: "text-source-reddit",
	},
	unknown: {
		label: "Unknown",
		code: "??",
		chip: "text-source-unknown border-source-unknown/35 bg-source-unknown/10",
		fg: "text-source-unknown",
	},
} as const satisfies Record<string, Registered>;

export type Source = keyof typeof SOURCES;

/* --- Keyword tags ---------------------------------------------------------
   Why we watch a word. Marketing-owned taxonomy, so expect it to grow. */
export const TAGS = {
	own: {
		label: "Own Brand",
		code: "OWN",
		chip: "text-tag-own border-tag-own/35 bg-tag-own/10",
		fg: "text-tag-own",
	},
	competitor: {
		label: "Competitor",
		code: "COMP",
		chip: "text-tag-competitor border-tag-competitor/35 bg-tag-competitor/10",
		fg: "text-tag-competitor",
	},
	ecosystem: {
		label: "Ecosystem",
		code: "ECO",
		chip: "text-tag-ecosystem border-tag-ecosystem/35 bg-tag-ecosystem/10",
		fg: "text-tag-ecosystem",
	},
	topic: {
		label: "Topic",
		code: "TOPIC",
		chip: "text-tag-topic border-tag-topic/35 bg-tag-topic/10",
		fg: "text-tag-topic",
	},
} as const satisfies Record<string, Registered>;

export type Tag = keyof typeof TAGS;

/* --- Auto-categories -----------------------------------------------------
   Assigned by the enrichment step. `question` is the one the team acts on,
   so it is the only category that gets a cool, attention-pulling hue. */
export const CATEGORIES = {
	question: {
		label: "Question",
		code: "Q",
		chip: "text-category-question border-category-question/35 bg-category-question/10",
		fg: "text-category-question",
	},
	praise: {
		label: "Praise",
		code: "PRAISE",
		chip: "text-category-praise border-category-praise/35 bg-category-praise/10",
		fg: "text-category-praise",
	},
	complaint: {
		label: "Complaint",
		code: "COMPLAINT",
		chip: "text-category-complaint border-category-complaint/35 bg-category-complaint/10",
		fg: "text-category-complaint",
	},
	request: {
		label: "Feature Request",
		code: "REQ",
		chip: "text-category-request border-category-request/35 bg-category-request/10",
		fg: "text-category-request",
	},
	discussion: {
		label: "Discussion",
		code: "DISC",
		chip: "text-category-discussion border-category-discussion/35 bg-category-discussion/10",
		fg: "text-category-discussion",
	},
} as const satisfies Record<string, Registered>;

export type Category = keyof typeof CATEGORIES;

/** Narrowing helper so an unrecognized source from the DB degrades instead
 *  of crashing the row. Mirror this for other registries as they grow. */
export function source(key: string): Registered {
	return SOURCES[key as Source] ?? SOURCES.unknown;
}
