import type { NewItem } from "#/db/schema";

/**
 * Everything platform-specific lives behind this interface: pagination, what
 * the cursor string means, mapping raw payloads onto the normalized `items`
 * shape, text normalization, and skip rules.
 */

/** A normalized piece of content, ready to insert (sans generated columns). */
export type SourceItem = Omit<NewItem, "id" | "createdAt">;

export interface SourceAdapter {
	/** A `Source` key from the registry, e.g. "hackernews". */
	source: string;
	/**
	 * Where a brand-new source starts walking. Forward only; history is
	 * never backfilled.
	 */
	seedCursor(): Promise<string>;
	/**
	 * One bounded page of work. `nextCursor` is opaque to the pipeline;
	 * `done` means the walk has caught up and the run can stop early.
	 */
	fetchPage(cursor: string): Promise<{
		items: SourceItem[];
		nextCursor: string;
		done: boolean;
	}>;
	/**
	 * Resolve the thread root (story title + link) for a matched comment.
	 * Called only for items that matched a keyword, so it may cost extra
	 * requests. Return null when the root can't be resolved.
	 */
	resolveThread?(
		item: SourceItem,
	): Promise<{ title: string | null; permalink: string } | null>;
}
