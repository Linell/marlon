import { eq } from "drizzle-orm";
import { db } from "#/db/client";
import { items, keywords, mentions } from "#/db/schema";
import { categorizer } from "#/lib/categorize";
import {
	buildCategorizePrompt,
	CATEGORIZE_FORMAT,
	LLM_MODEL,
	type LlmCategorization,
	openaiClient,
	resolveCategorization,
	responseOutputText,
	shouldJudge,
	snippetAroundMatch,
} from "#/lib/llm";
import { matchTerms } from "#/lib/match";
import { applyCategorization, publishCategorized } from "../categorization";
import { inngest } from "../client";
import { mentionCreatedLlm } from "../events";
import { categoryJudge, type JudgeInput } from "./categoryJudge";

/* --- llm-categorize ------------------------------------------------------------
   Enrichment for `llmEnabled` keywords: one structured-output call both
   confirms the keyword match and assigns the category; the LLM is
   authoritative. The rules guess is computed in memory only, to score how bad
   the rules are (`rules_agreement`), and 1 in 5 runs defers a second-opinion
   judge (`judge_agreement`).

   Its own concurrency-2 pool rather than enrich-mention's: slow OpenAI calls
   must not starve the fast rules-only writes, and libsql's single writer only
   sees the brief UPDATE at the end. Throttle is sized for a low OpenAI tier —
   backlog beats 429s at this volume. */
export const llmCategorize = inngest.createFunction(
	{
		id: "llm-categorize",
		triggers: [mentionCreatedLlm],
		concurrency: { limit: 2 },
		throttle: { limit: 30, period: "1m" },
		retries: 2,
	},
	async ({ event, step, runId, logger, defer }) => {
		const { mentionId } = event.data;

		const loaded = await step.run("load", async () => {
			const [row] = await db
				.select({
					category: mentions.category,
					title: items.title,
					bodyText: items.bodyText,
					term: keywords.term,
					aliases: keywords.aliases,
				})
				.from(mentions)
				.innerJoin(items, eq(mentions.itemId, items.id))
				.innerJoin(keywords, eq(mentions.keywordId, keywords.id))
				.where(eq(mentions.id, mentionId));
			return row ?? null;
		});
		if (!loaded) return { applied: false, reason: "mention missing" };
		if (loaded.category !== null) {
			return { applied: false, reason: "already categorized" };
		}

		const rulesGuess = categorizer.categorize(loaded);

		const openai = openaiClient();
		if (!openai) {
			/* Rules fallback. No scores here — rules-vs-rules agreement is
			   always 1 and would pollute the metrics. */
			logger.warn("OPENAI_API_KEY unset; llm-categorize fell back to rules");
			const applied = await step.run("categorize-rules", () =>
				applyCategorization(mentionId, {
					category: rulesGuess,
					categorizedBy: categorizer.id,
				}),
			);
			if (applied) await publishCategorized(step, mentionId, rulesGuess);
			return { applied, category: rulesGuess, categorizedBy: categorizer.id };
		}

		const terms = matchTerms(loaded);
		const text = [loaded.title, loaded.bodyText].filter(Boolean).join("\n");
		const snippet = snippetAroundMatch(text, terms);
		const prompt = buildCategorizePrompt({
			term: loaded.term,
			aliases: loaded.aliases,
			title: loaded.title,
			snippet,
		});

		const response = await step.ai.wrap(
			"categorize",
			(input: string) =>
				openai.responses.create({
					model: LLM_MODEL,
					input,
					text: { format: CATEGORIZE_FORMAT },
				}),
			prompt,
		);
		const llm = JSON.parse(responseOutputText(response)) as LlmCategorization;
		const { category, disposition } = resolveCategorization(llm);

		/* The write and the agreement score are independent — one parallel
		   plan saves a step round trip on every mention. */
		const [applied] = await Promise.all([
			step.run("write-categorization", () =>
				applyCategorization(mentionId, {
					category,
					disposition,
					categorizedBy: "llm",
					enrichRunId: runId,
				}),
			),
			step.score("rules-agreement", {
				name: "rules_agreement",
				value: rulesGuess === llm.category,
			}),
		]);

		if (shouldJudge(mentionId)) {
			const data: JudgeInput = {
				mentionId,
				term: loaded.term,
				title: loaded.title,
				snippet,
				category,
			};
			defer("judge-category", { function: categoryJudge, data });
		}

		if (applied) await publishCategorized(step, mentionId, category);

		return { applied, category, disposition };
	},
);
