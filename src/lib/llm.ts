import OpenAI from "openai";
import { type Category, FILTERABLE_CATEGORIES } from "#/components/ui/registry";
import { splitOnTerms } from "#/lib/match";

/**
 * LLM CATEGORIZATION
 * -----------------------------------------------------------------------------
 * Everything the llm-categorize function needs that isn't workflow: the OpenAI
 * client, model, threshold, and the pure pieces (snippet, prompt, result
 * mapping, judge sampling) so they can be unit-tested without Inngest.
 *
 * One cheap structured-output call both confirms the keyword match (ambiguous
 * terms like "Mercury" produce false positives) and assigns the category. The
 * LLM never guesses: below-threshold confidence writes `uncategorized`.
 */

export const LLM_MODEL = "gpt-5-nano";
export const CONFIDENCE_THRESHOLD = 0.7;

/** Null when OPENAI_API_KEY is unset — callers fall back to the rules path. */
export function openaiClient(): OpenAI | null {
	const apiKey = process.env.OPENAI_API_KEY;
	return apiKey ? new OpenAI({ apiKey }) : null;
}

/** The categories the LLM may assign — the same "every real category" set
 *  the filter bar shows, so the two vocabularies can't drift apart.
 *  `uncategorized` is ours, not its. */
const ASSIGNABLE = FILTERABLE_CATEGORIES;

export type LlmCategorization = {
	isMatch: boolean;
	category: Category | null;
	confidence: number;
};

/** Structured-output contract for the categorize call. */
export const CATEGORIZE_FORMAT = {
	type: "json_schema",
	name: "mention_categorization",
	strict: true,
	schema: {
		type: "object",
		properties: {
			isMatch: { type: "boolean" },
			category: { type: ["string", "null"], enum: [...ASSIGNABLE, null] },
			confidence: { type: "number", minimum: 0, maximum: 1 },
		},
		required: ["isMatch", "category", "confidence"],
		additionalProperties: false,
	},
} as const;

/**
 * ~200 chars of context around the first keyword hit, reusing the matcher's
 * own positions so the LLM sees exactly what triggered the mention. Falls
 * back to the head of the text when nothing matches (title-only hits).
 */
export function snippetAroundMatch(
	text: string,
	terms: string[],
	radius = 100,
): string {
	const runs = splitOnTerms(text, terms);
	let offset = 0;
	let matchStart = -1;
	let matchEnd = -1;
	for (const run of runs) {
		if (run.match) {
			matchStart = offset;
			matchEnd = offset + run.text.length;
			break;
		}
		offset += run.text.length;
	}

	if (matchStart < 0) {
		const head = text.slice(0, radius * 2).trim();
		return text.length > radius * 2 ? `${head} ...` : head;
	}

	const start = Math.max(0, matchStart - radius);
	const end = Math.min(text.length, matchEnd + radius);
	const prefix = start > 0 ? "... " : "";
	const suffix = end < text.length ? " ..." : "";
	return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function buildCategorizePrompt(input: {
	term: string;
	aliases: string[];
	title: string | null;
	snippet: string;
}): string {
	const forms = [input.term, ...input.aliases].join(", ");
	return [
		`We track mentions of the topic "${input.term}" (surface forms: ${forms}).`,
		`A keyword matcher flagged this post. Decide two things:`,
		`1. isMatch — is the post genuinely about that topic, not an unrelated`,
		`   sense of the word?`,
		`2. category — one of ${ASSIGNABLE.join(", ")}; null if unsure.`,
		`Report confidence in the category as 0..1.`,
		``,
		input.title ? `Title: ${input.title}` : `Title: (none)`,
		`Excerpt around the match:`,
		input.snippet,
	].join("\n");
}

/**
 * Text out of a Responses API result. `step.ai.wrap` outputs are JSON
 * round-tripped on replay, so the SDK's `output_text` convenience can't be
 * relied on — fall back to walking the raw `output` blocks.
 */
export function responseOutputText(response: unknown): string {
	const r = (response ?? {}) as {
		output_text?: unknown;
		output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
	};
	if (typeof r.output_text === "string" && r.output_text.length > 0) {
		return r.output_text;
	}
	return (r.output ?? [])
		.flatMap((block) => block.content ?? [])
		.filter((part) => part.type === "output_text")
		.map((part) => (typeof part.text === "string" ? part.text : ""))
		.join("");
}

/**
 * LLM result → the one mention write. `category` is always terminal
 * (non-null): NULL means "not yet enriched" and guards idempotency, so even
 * a rejected match writes `uncategorized`.
 */
export function resolveCategorization(
	llm: LlmCategorization,
	threshold = CONFIDENCE_THRESHOLD,
): { category: Category; disposition: "not_a_match" | null } {
	const disposition = llm.isMatch ? null : ("not_a_match" as const);
	if (llm.isMatch && llm.confidence >= threshold && llm.category !== null) {
		return { category: llm.category, disposition };
	}
	return { category: "uncategorized", disposition };
}

/**
 * Deterministic 1-in-`rate` sample for the second-opinion judge. Hashes the
 * mention id (FNV-1a) rather than rolling dice so replays make the same call.
 */
export function shouldJudge(mentionId: string, rate = 5): boolean {
	let hash = 0x811c9dc5;
	for (let i = 0; i < mentionId.length; i++) {
		hash ^= mentionId.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) % rate === 0;
}
