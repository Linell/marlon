import { describe, expect, it, vi } from "vitest";
import {
	buildCategorizePrompt,
	openaiClient,
	resolveCategorization,
	responseOutputText,
	shouldJudge,
	snippetAroundMatch,
} from "#/lib/llm";

describe("snippetAroundMatch", () => {
	it("returns short text unchanged when it contains a match", () => {
		const text = "I love Foo widgets";
		expect(snippetAroundMatch(text, ["Foo"])).toBe(text);
	});

	it("adds a leading and trailing marker when truncated on both sides", () => {
		const pad = "x".repeat(200);
		const text = `${pad} Foo ${pad}`;
		const result = snippetAroundMatch(text, ["Foo"], 10);
		expect(result.startsWith("... ")).toBe(true);
		expect(result.endsWith(" ...")).toBe(true);
		expect(result).toContain("Foo");
	});

	it("adds only a trailing marker when the match is at the start", () => {
		const pad = "x".repeat(200);
		const text = `Foo ${pad}`;
		const result = snippetAroundMatch(text, ["Foo"], 10);
		expect(result.startsWith("... ")).toBe(false);
		expect(result.endsWith(" ...")).toBe(true);
	});

	it("adds only a leading marker when the match is at the end", () => {
		const pad = "x".repeat(200);
		const text = `${pad} Foo`;
		const result = snippetAroundMatch(text, ["Foo"], 10);
		expect(result.startsWith("... ")).toBe(true);
		expect(result.endsWith(" ...")).toBe(false);
	});

	it("falls back to the head of the text with a trailing marker when nothing matches", () => {
		const text = "a".repeat(300);
		const result = snippetAroundMatch(text, ["Foo"], 100);
		expect(result).toBe(`${"a".repeat(200)} ...`);
	});

	it("falls back to the full head unmarked when nothing matches and text is short", () => {
		const text = "a".repeat(50);
		const result = snippetAroundMatch(text, ["Foo"], 100);
		expect(result).toBe(text);
	});
});

describe("buildCategorizePrompt", () => {
	it("includes the term, aliases, title, and snippet", () => {
		const prompt = buildCategorizePrompt({
			term: "Mercury",
			aliases: ["MercuryLang", "Merc"],
			title: "Why we chose Mercury",
			snippet: "... Mercury is great for this ...",
		});
		expect(prompt).toContain("Mercury");
		expect(prompt).toContain("MercuryLang");
		expect(prompt).toContain("Merc");
		expect(prompt).toContain("Title: Why we chose Mercury");
		expect(prompt).toContain("... Mercury is great for this ...");
	});

	it("renders Title: (none) for a null title", () => {
		const prompt = buildCategorizePrompt({
			term: "Mercury",
			aliases: [],
			title: null,
			snippet: "snippet text",
		});
		expect(prompt).toContain("Title: (none)");
	});
});

describe("resolveCategorization", () => {
	it("rejects non-matches regardless of confidence", () => {
		expect(
			resolveCategorization({
				isMatch: false,
				category: "question",
				confidence: 0.99,
			}),
		).toEqual({ category: "uncategorized", disposition: "not_a_match" });
	});

	it("marks low-confidence matches uncategorized without rejecting", () => {
		expect(
			resolveCategorization({
				isMatch: true,
				category: "question",
				confidence: 0.5,
			}),
		).toEqual({ category: "uncategorized", disposition: null });
	});

	it("falls back to uncategorized when confident but category is null", () => {
		expect(
			resolveCategorization({
				isMatch: true,
				category: null,
				confidence: 0.9,
			}),
		).toEqual({ category: "uncategorized", disposition: null });
	});

	it("keeps the category when confident and category is set", () => {
		expect(
			resolveCategorization({
				isMatch: true,
				category: "question",
				confidence: 0.9,
			}),
		).toEqual({ category: "question", disposition: null });
	});

	it("treats confidence exactly at the threshold as confident", () => {
		expect(
			resolveCategorization(
				{ isMatch: true, category: "question", confidence: 0.7 },
				0.7,
			),
		).toEqual({ category: "question", disposition: null });
	});
});

describe("shouldJudge", () => {
	it("is deterministic for the same id", () => {
		const id = crypto.randomUUID();
		expect(shouldJudge(id)).toBe(shouldJudge(id));
	});

	it("samples roughly 1 in 5 across many ids", () => {
		const n = 2000;
		let sampled = 0;
		for (let i = 0; i < n; i++) {
			if (shouldJudge(crypto.randomUUID())) sampled++;
		}
		const rate = sampled / n;
		expect(rate).toBeGreaterThan(0.12);
		expect(rate).toBeLessThan(0.28);
	});
});

describe("responseOutputText", () => {
	it("prefers a string output_text", () => {
		expect(responseOutputText({ output_text: "hello" })).toBe("hello");
	});

	it("falls back to concatenating output_text parts", () => {
		const response = {
			output: [
				{
					content: [
						{ type: "output_text", text: "hello " },
						{ type: "refusal", text: "ignored" },
						{ type: "output_text", text: "world" },
					],
				},
				{ content: [{ type: "output_text", text: "!" }] },
			],
		};
		expect(responseOutputText(response)).toBe("hello world!");
	});

	it("returns empty string for junk", () => {
		expect(responseOutputText({})).toBe("");
		expect(responseOutputText({ output_text: "" })).toBe("");
		expect(responseOutputText("garbage")).toBe("");
		expect(responseOutputText({ output: [] })).toBe("");
	});
});

describe("openaiClient", () => {
	it("returns null when OPENAI_API_KEY is unset", () => {
		vi.stubEnv("OPENAI_API_KEY", undefined);
		expect(openaiClient()).toBeNull();
		vi.unstubAllEnvs();
	});

	it("returns a client when OPENAI_API_KEY is set", () => {
		vi.stubEnv("OPENAI_API_KEY", "sk-test-dummy");
		expect(openaiClient()).not.toBeNull();
		vi.unstubAllEnvs();
	});
});
