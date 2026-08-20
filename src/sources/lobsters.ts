import type { SourceAdapter, SourceItem } from "./types";

/**
 * LOBSTE.RS ADAPTER
 * -----------------------------------------------------------------------------
 * Lobste.rs has no item-id firehose like HN's `maxitem`, so we walk two
 * time-ordered feeds instead:
 *
 *   stories   — `/newest.json`, paginated, complete
 *   comments  — `/comments.rss`, the site-wide newest-comments feed (the only
 *               comment firehose; there is no `/comments.json`), hydrated one
 *               `/c/{id}.json` each
 *
 * The cursor is a JSON pair of ISO watermarks, one per feed; a page is
 * "everything newer than the watermarks", so `done` is always true. The RSS
 * hop is parse-only: ids and story titles come from the feed, all item data
 * from JSON. The feed also means comments arrive with their story title
 * attached, so thread context is set at fetch time and `resolveThread` isn't
 * needed.
 *
 * Skip rules: deleted/moderated comments, and comments whose parent story
 * can't be derived from the permalink. Volume is tiny (dozens of stories and
 * a few hundred comments a day), so one fetch per feed per run keeps up; the
 * RSS feed's ~25-entry window is the real ceiling on burst recovery.
 *
 * Requests are serial with a pause between them: lobste.rs 429s concurrent
 * fetches, and at ≤25 comments per run there's nothing to gain from racing it.
 */

const BASE = "https://lobste.rs";

/** `/newest` pages walked per run before giving up on reaching the watermark. */
const MAX_STORY_PAGES = 4;
/** Pause between requests; lobste.rs rate-limits eagerly. */
const REQUEST_SPACING_MS = 500;

type Cursor = { stories: string; comments: string };

type LobstersStory = {
	short_id: string;
	created_at: string;
	title: string;
	url: string;
	description_plain: string;
	submitter_user: string;
	short_id_url: string;
};

type LobstersComment = {
	short_id: string;
	created_at: string;
	is_deleted: boolean;
	is_moderated: boolean;
	parent_comment: string | null;
	comment_plain: string;
	commenting_user: string;
	/** Permalink into the story thread, e.g. `/s/dns8du/slug#c_2bongq`. */
	url: string;
};

/** One `<item>` from the comments feed: the comment id plus story context. */
type FeedEntry = { id: string; storyTitle: string; publishedAt: Date };

let lastRequestAt = 0;

async function getText(path: string): Promise<string> {
	const wait = lastRequestAt + REQUEST_SPACING_MS - Date.now();
	if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
	lastRequestAt = Date.now();

	const res = await fetch(`${BASE}/${path}`, {
		headers: { "User-Agent": "marlon-keyword-tracker" },
	});
	if (!res.ok) throw new Error(`lobste.rs ${path}: ${res.status}`);
	return res.text();
}

async function getJson<T>(path: string): Promise<T> {
	return JSON.parse(await getText(`${path}.json`)) as T;
}

function parseCursor(cursor: string): Cursor {
	const parsed = JSON.parse(cursor) as Partial<Cursor>;
	if (!parsed.stories || !parsed.comments) {
		throw new Error(`Bad lobste.rs cursor "${cursor}"`);
	}
	return { stories: parsed.stories, comments: parsed.comments };
}

function latestOf(watermark: string, dates: Date[]): string {
	const max = Math.max(
		new Date(watermark).getTime(),
		...dates.map((d) => d.getTime()),
	);
	return new Date(max).toISOString();
}

/* --- Stories ------------------------------------------------------------- */

function storyToSourceItem(story: LobstersStory): SourceItem {
	return {
		source: "lobsters",
		sourceId: story.short_id,
		sourceParentId: null,
		type: "story",
		title: story.title,
		author: story.submitter_user,
		bodyText: story.description_plain || null,
		url: story.url || null,
		permalink: story.short_id_url,
		postedAt: new Date(story.created_at),
		raw: story,
	};
}

/** Walk `/newest` pages until one dips below the watermark (or the cap). */
async function fetchStoriesSince(since: Date): Promise<LobstersStory[]> {
	const out: LobstersStory[] = [];
	for (let page = 1; page <= MAX_STORY_PAGES; page++) {
		const path = page === 1 ? "newest" : `newest/page/${page}`;
		const stories = await getJson<LobstersStory[]>(path);
		out.push(...stories.filter((s) => new Date(s.created_at) > since));
		const oldest = stories.at(-1);
		if (!oldest || new Date(oldest.created_at) <= since) break;
	}
	return out;
}

/* --- Comments -------------------------------------------------------------- */

function decodeXml(text: string): string {
	return text
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&gt;/g, ">")
		.replace(/&lt;/g, "<")
		.replace(/&amp;/g, "&");
}

/** Pull id, story title, and pubDate out of each `<item>`; nothing more. */
function parseCommentsFeed(xml: string): FeedEntry[] {
	const entries: FeedEntry[] = [];
	for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
		const id = item.match(/<guid>.*\/c\/(\w+)<\/guid>/)?.[1];
		const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1];
		const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
		if (!id || !title || !pubDate) continue;
		entries.push({
			id,
			storyTitle: decodeXml(title.trim()),
			publishedAt: new Date(pubDate),
		});
	}
	return entries;
}

/** `/s/dns8du/slug#c_x` → story short id `dns8du`; the fallback parent. */
function storyIdFromPermalink(permalink: string): string | null {
	return permalink.match(/\/s\/(\w+)\//)?.[1] ?? null;
}

function commentToSourceItem(
	comment: LobstersComment,
	entry: FeedEntry,
): SourceItem | null {
	if (comment.is_deleted || comment.is_moderated) return null;
	const parentId = comment.parent_comment ?? storyIdFromPermalink(comment.url);
	if (!parentId) return null;
	return {
		source: "lobsters",
		sourceId: comment.short_id,
		sourceParentId: parentId,
		threadTitle: entry.storyTitle,
		threadPermalink: comment.url.split("#")[0],
		type: "comment",
		title: null,
		author: comment.commenting_user,
		bodyText: comment.comment_plain,
		url: null,
		permalink: comment.url,
		postedAt: new Date(comment.created_at),
		raw: comment,
	};
}

/** Hydrate feed entries one by one; `getText` paces the requests. */
async function fetchComments(entries: FeedEntry[]): Promise<SourceItem[]> {
	const out: SourceItem[] = [];
	for (const entry of entries) {
		const comment = await getJson<LobstersComment>(`c/${entry.id}`);
		const item = commentToSourceItem(comment, entry);
		if (item) out.push(item);
	}
	return out;
}

/* --- Adapter ---------------------------------------------------------------- */

export const lobsters: SourceAdapter = {
	source: "lobsters",

	async seedCursor() {
		const now = new Date().toISOString();
		return JSON.stringify({ stories: now, comments: now } satisfies Cursor);
	},

	async fetchPage(cursor) {
		const marks = parseCursor(cursor);

		const stories = await fetchStoriesSince(new Date(marks.stories));
		const feed = parseCommentsFeed(await getText("comments.rss"));
		const fresh = feed.filter(
			(entry) => entry.publishedAt > new Date(marks.comments),
		);
		const comments = await fetchComments(fresh);

		const nextCursor: Cursor = {
			stories: latestOf(
				marks.stories,
				stories.map((s) => new Date(s.created_at)),
			),
			comments: latestOf(
				marks.comments,
				fresh.map((entry) => entry.publishedAt),
			),
		};

		return {
			items: [...stories.map(storyToSourceItem), ...comments],
			nextCursor: JSON.stringify(nextCursor),
			done: true,
		};
	},
};
