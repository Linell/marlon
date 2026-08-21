import { createScorer } from "inngest/experimental";
import { LLM_MODEL, openaiClient, responseOutputText } from "#/lib/llm";
import { inngest } from "../client";

/**
 * CATEGORY JUDGE
 * -----------------------------------------------------------------------------
 * Sampled second opinion on llm-categorize output (1 in 5, deferred from the
 * parent run). `createScorer` forwards the returned score to the *parent* run,
 * so `judge_agreement` lands next to that run's `rules_agreement`.
 */

const JUDGE_FORMAT = {
	type: "json_schema",
	name: "category_verdict",
	strict: true,
	schema: {
		type: "object",
		properties: { correct: { type: "boolean" } },
		required: ["correct"],
		additionalProperties: false,
	},
} as const;

export type JudgeInput = {
	mentionId: string;
	term: string;
	title: string | null;
	snippet: string;
	category: string;
};

export const categoryJudge = createScorer(
	inngest,
	{ id: "category-judge", retries: 2 },
	async ({ event, step }) => {
		const data = event.data as JudgeInput;
		const openai = openaiClient();
		if (!openai) return null;

		const prompt = [
			`A classifier labeled this mention of "${data.term}" as "${data.category}".`,
			`Is that categorization correct?`,
			``,
			data.title ? `Title: ${data.title}` : `Title: (none)`,
			`Excerpt around the match:`,
			data.snippet,
		].join("\n");

		const response = await step.ai.wrap(
			"judge",
			(input: string) =>
				openai.responses.create({
					model: LLM_MODEL,
					input,
					text: { format: JUDGE_FORMAT },
				}),
			prompt,
		);
		const verdict = JSON.parse(responseOutputText(response)) as {
			correct: boolean;
		};

		return { name: "judge_agreement", value: verdict.correct };
	},
);
