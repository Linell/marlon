import type { SourceAdapter, SourceItem } from "./types";

/**
 * HACKER NEWS ADAPTER
 * -----------------------------------------------------------------------------
 * HN has no "items since X" endpoint — item ids are a monotonic counter, so
 * the cursor is simply the last item id we looked at and a page is the next
 * contiguous block of ids. New accounts start at the current `maxitem`
 * (forward only, no backfill).
 *
 * Skip rules: null payloads (id allocated, item not readable), `dead`,
 * `deleted`, and anything without text to match against. We also stay
 * LAG_CEILING ids below maxitem so items still being written/moderated get a
 * settling window before we read them.
 */

const API = "https://hacker-news.firebaseio.com/v0";

/** Ids fetched per `fetchPage` call — one Inngest step's worth of work. */
const PAGE_SIZE = 150;
/** Concurrent item requests within a page. */
const FETCH_CONCURRENCY = 25;
/** Stay this many ids behind maxitem. */
const LAG_CEILING = 50;
/** Parent hops allowed when walking a comment up to its story. */
const MAX_THREAD_DEPTH = 40;

type HnItem = {
	id: number;
	type?: string;
	by?: string;
	time?: number;
	text?: string;
	parent?: number;
	url?: string;
	title?: string;
	dead?: boolean;
	deleted?: boolean;
};

async function getJson<T>(path: string): Promise<T> {
	const res = await fetch(`${API}/${path}.json`);
	if (!res.ok) throw new Error(`HN API ${path}: ${res.status}`);
	return (await res.json()) as T;
}

/** HN `text`/`title` fields are HTML fragments; matching wants plain text. */
function normalizeHtml(html: string): string {
	return html
		.replace(/<p>/gi, "\n\n")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/g, (_, dec) =>
			String.fromCodePoint(Number.parseInt(dec, 10)),
		)
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&gt;/g, ">")
		.replace(/&lt;/g, "<")
		.replace(/&amp;/g, "&")
		.trim();
}

function toSourceItem(item: HnItem): SourceItem | null {
	if (item.dead || item.deleted || !item.type) return null;
	const title = item.title ? normalizeHtml(item.title) : null;
	const bodyText = item.text ? normalizeHtml(item.text) : null;
	if (!title && !bodyText) return null;
	return {
		source: "hackernews",
		sourceId: String(item.id),
		sourceParentId: item.parent != null ? String(item.parent) : null,
		type: item.type,
		title,
		author: item.by ?? null,
		bodyText,
		url: item.url ?? null,
		permalink: `https://news.ycombinator.com/item?id=${item.id}`,
		postedAt: item.time != null ? new Date(item.time * 1000) : null,
		raw: item,
	};
}

/** Fetch ids in bounded batches so a 150-id page isn't 150 parallel sockets. */
async function fetchItems(ids: number[]): Promise<(HnItem | null)[]> {
	const out: (HnItem | null)[] = [];
	for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
		const batch = ids.slice(i, i + FETCH_CONCURRENCY);
		out.push(
			...(await Promise.all(
				batch.map((id) => getJson<HnItem | null>(`item/${id}`)),
			)),
		);
	}
	return out;
}

export const hackernews: SourceAdapter = {
	source: "hackernews",

	async seedCursor() {
		return String(await getJson<number>("maxitem"));
	},

	async fetchPage(cursor) {
		const last = Number.parseInt(cursor, 10);
		if (Number.isNaN(last)) throw new Error(`Bad HN cursor "${cursor}"`);

		const ceiling = (await getJson<number>("maxitem")) - LAG_CEILING;
		const start = last + 1;
		if (start > ceiling) return { items: [], nextCursor: cursor, done: true };

		const end = Math.min(start + PAGE_SIZE - 1, ceiling);
		const ids = Array.from({ length: end - start + 1 }, (_, i) => start + i);
		const items = (await fetchItems(ids))
			.filter((item): item is HnItem => item != null)
			.map(toSourceItem)
			.filter((item): item is SourceItem => item != null);

		return { items, nextCursor: String(end), done: end >= ceiling };
	},

	async resolveThread(item) {
		if (item.sourceParentId == null) return null;
		let id = Number.parseInt(item.sourceParentId, 10);
		for (let hop = 0; hop < MAX_THREAD_DEPTH; hop++) {
			const parent = await getJson<HnItem | null>(`item/${id}`);
			if (!parent) return null;
			if (parent.parent == null) {
				return {
					title: parent.title ? normalizeHtml(parent.title) : null,
					permalink: `https://news.ycombinator.com/item?id=${parent.id}`,
				};
			}
			id = parent.parent;
		}
		return null;
	},
};
