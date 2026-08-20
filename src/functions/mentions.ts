import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "#/db/client";
import { items, keywords, mentions } from "#/db/schema";

/**
 * MENTION SERVER FUNCTIONS
 * -----------------------------------------------------------------------------
 * Read side of the pipeline: one flat row per mention, joined to its item and
 * the keyword that surfaced it.
 */

export const listMentions = createServerFn().handler(async () => {
	return db
		.select({
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
		})
		.from(mentions)
		.innerJoin(items, eq(mentions.itemId, items.id))
		.innerJoin(keywords, eq(mentions.keywordId, keywords.id))
		.orderBy(desc(mentions.createdAt))
		.limit(100);
});

export type MentionRow = Awaited<ReturnType<typeof listMentions>>[number];
