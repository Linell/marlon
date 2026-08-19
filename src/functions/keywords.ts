import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { TAGS, type Tag } from "#/components/ui/registry";
import { db } from "#/db/client";
import { keywords } from "#/db/schema";

/**
 * KEYWORD SERVER FUNCTIONS
 * -----------------------------------------------------------------------------
 * The full write path for the keyword taxonomy. Validation lives in the
 * validators — by the time a handler runs, the shape is trusted.
 */

type KeywordInput = {
	term: string;
	tag: Tag;
	include: string[];
	exclude: string[];
};

/** Normalize a term list: trim, drop empties, dedupe case-insensitively. */
function cleanTerms(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") continue;
		const term = item.trim();
		const key = term.toLowerCase();
		if (!term || seen.has(key)) continue;
		seen.add(key);
		out.push(term);
	}
	return out;
}

function validateKeywordInput(data: unknown): KeywordInput {
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected a keyword object");
	}
	const { term, tag } = data as Record<string, unknown>;

	if (typeof term !== "string" || term.trim().length === 0) {
		throw new Error("A keyword term is required");
	}
	if (typeof tag !== "string" || !(tag in TAGS)) {
		throw new Error(`Unknown tag "${String(tag)}"`);
	}

	const include = cleanTerms((data as Record<string, unknown>).include);
	const exclude = cleanTerms((data as Record<string, unknown>).exclude);

	return { term: term.trim(), tag: tag as Tag, include, exclude };
}

export const listKeywords = createServerFn().handler(async () => {
	return db.select().from(keywords).orderBy(desc(keywords.createdAt));
});

export const createKeyword = createServerFn({ method: "POST" })
	.validator(validateKeywordInput)
	.handler(async ({ data }) => {
		const [created] = await db.insert(keywords).values(data).returning();
		return created;
	});

export const setKeywordActive = createServerFn({ method: "POST" })
	.validator((data: { id: string; active: boolean }) => {
		if (typeof data?.id !== "string" || typeof data?.active !== "boolean") {
			throw new Error("Expected { id, active }");
		}
		return { id: data.id, active: data.active };
	})
	.handler(async ({ data }) => {
		const [updated] = await db
			.update(keywords)
			.set({ active: data.active })
			.where(eq(keywords.id, data.id))
			.returning();
		return updated ?? null;
	});

export const deleteKeyword = createServerFn({ method: "POST" })
	.validator((data: { id: string }) => {
		if (typeof data?.id !== "string") throw new Error("Expected { id }");
		return { id: data.id };
	})
	.handler(async ({ data }) => {
		await db.delete(keywords).where(eq(keywords.id, data.id));
		return { deleted: true };
	});
