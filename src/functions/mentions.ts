import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "#/db/client";
import { items, keywords, mentions } from "#/db/schema";

/**
 * MENTION SERVER FUNCTIONS
 * -----------------------------------------------------------------------------
 * Read side of the pipeline: one flat row per mention, joined to its item and
 * the keyword that surfaced it.
 */

const mentionSelect = {
	id: mentions.id,
	category: mentions.category,
	createdAt: mentions.createdAt,
	source: items.source,
	type: items.type,
	title: items.title,
	bodyText: items.bodyText,
	author: items.author,
	permalink: items.permalink,
	threadTitle: items.threadTitle,
	threadPermalink: items.threadPermalink,
	postedAt: items.postedAt,
	term: keywords.term,
	tag: keywords.tag,
};

function mentionsQuery() {
	return db
		.select(mentionSelect)
		.from(mentions)
		.innerJoin(items, eq(mentions.itemId, items.id))
		.innerJoin(keywords, eq(mentions.keywordId, keywords.id));
}

function validateMentionIds(data: unknown): { ids: string[] } {
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected { ids: string[] }");
	}

	const { ids } = data as Record<string, unknown>;
	if (!Array.isArray(ids)) {
		throw new Error("Expected { ids: string[] }");
	}

	const seen = new Set<string>();
	const out: string[] = [];

	for (const value of ids) {
		if (typeof value !== "string") continue;
		const id = value.trim();
		if (id.length === 0 || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
		if (out.length >= 100) break;
	}

	return { ids: out };
}

export const listMentions = createServerFn().handler(async () => {
	return mentionsQuery().orderBy(desc(mentions.createdAt)).limit(100);
});

export const listMentionsByIds = createServerFn({ method: "POST" })
	.validator(validateMentionIds)
	.handler(async ({ data }) => {
		if (data.ids.length === 0) return [];

		return mentionsQuery()
			.where(inArray(mentions.id, data.ids))
			.orderBy(desc(mentions.createdAt));
	});

export type MentionRow = Awaited<ReturnType<typeof listMentions>>[number];
