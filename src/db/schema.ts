import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * SCHEMA
 * -----------------------------------------------------------------------------
 * SQLite via libsql today; the same schema runs unchanged on Turso, since
 * Turso *is* libsql. Nothing in here is SQLite-flavored beyond what Drizzle's
 * sqlite-core dialect emits.
 *
 * Enum-ish columns (`source`, `tag`, `category`) are plain text on purpose:
 * their vocabulary lives in `src/components/ui/registry.ts`, and a check
 * constraint would turn every marketing-taxonomy addition into a migration.
 * The registry's fallback entries mean an unrecognized value degrades in the
 * UI instead of crashing.
 */

const uuid = () => crypto.randomUUID();
const now = () => new Date();

/* --- Keywords --------------------------------------------------------------
   One row per tracked term. `include`/`exclude` are the co-occurrence rules:
   a post matches when `term` appears, every `include` term (if any) also
   appears, and no `exclude` term does — the "Mercury, but not car or
   dealership" case. */
export const keywords = sqliteTable("keywords", {
	id: text("id").primaryKey().$defaultFn(uuid),
	term: text("term").notNull(),
	/** Why we watch this word — a `Tag` key from the registry. */
	tag: text("tag").notNull(),
	include: text("include", { mode: "json" })
		.$type<string[]>()
		.notNull()
		.default([]),
	exclude: text("exclude", { mode: "json" })
		.$type<string[]>()
		.notNull()
		.default([]),
	active: integer("active", { mode: "boolean" }).notNull().default(true),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(now),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(now)
		.$onUpdateFn(now),
});

/* --- Items -----------------------------------------------------------------
   One row per matched piece of content, normalized across sources. Only
   matches are stored — the firehose is matched in memory and discarded, so
   keyword edits never rematch old content.

   `sourceParentId` is the *source's* id for the parent (an HN item id), not a
   self-reference: we usually match a comment whose parent we never imported.
   If the parent was imported too, it can be found via (source, sourceId). */
export const items = sqliteTable(
	"items",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		/** A `Source` key from the registry, e.g. "hackernews". */
		source: text("source").notNull(),
		/** The id the source uses, e.g. an HN item id. */
		sourceId: text("source_id").notNull(),
		sourceParentId: text("source_parent_id"),
		/** Source vocabulary: "story", "comment", … */
		type: text("type").notNull(),
		title: text("title"),
		author: text("author"),
		/** Normalized plain text — HTML stripped, entities decoded. */
		bodyText: text("body_text"),
		/** Outbound link the item points at (an HN story's `url`). */
		url: text("url"),
		/** Canonical link back to the item on its platform. */
		permalink: text("permalink").notNull(),
		postedAt: integer("posted_at", { mode: "timestamp" }),
		/** Verbatim source payload, for re-enrichment and debugging. */
		raw: text("raw", { mode: "json" }).$type<unknown>().notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(now),
	},
	(t) => [uniqueIndex("items_source_source_id").on(t.source, t.sourceId)],
);

/* --- Mentions ----------------------------------------------------------------
   The join between an item and the keyword that surfaced it, and the home of
   enrichment output. An item mentioning two tracked keywords gets two rows.
   `category IS NULL` means enrichment hasn't run yet; there is no status
   column.
   `categorizedBy` records which enrichment path ran ("rules" today, "llm"
   maybe later) so swapping implementations stays observable. */
export const mentions = sqliteTable(
	"mentions",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		itemId: text("item_id")
			.notNull()
			.references(() => items.id, { onDelete: "cascade" }),
		keywordId: text("keyword_id")
			.notNull()
			.references(() => keywords.id, { onDelete: "cascade" }),
		/** A `Category` key from the registry; null until enrichment runs. */
		category: text("category"),
		categorizedBy: text("categorized_by"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(now),
	},
	(t) => [uniqueIndex("mentions_item_keyword").on(t.itemId, t.keywordId)],
);

/* --- Source cursors ----------------------------------------------------------
   Per-source import bookmark. Text rather than integer because only HN's
   cursor happens to be numeric; another source's might be an opaque token. */
export const sourceCursors = sqliteTable("source_cursors", {
	source: text("source").primaryKey(),
	cursor: text("cursor").notNull(),
	lastRunAt: integer("last_run_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(now)
		.$onUpdateFn(now),
});

export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Mention = typeof mentions.$inferSelect;
export type NewMention = typeof mentions.$inferInsert;
