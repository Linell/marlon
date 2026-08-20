import { useState } from "react";
import { splitOnTerms } from "#/lib/match";
import { CategoryChip, SourceChip, TagChip } from "./Chip";
import { cx } from "./cx";
import type { Category, Tag } from "./registry";

/**
 * MENTION — the atom of the whole product.
 *
 * Design decisions worth keeping as this grows:
 *  - The body is the loudest thing in the row. Everything else is
 *    metadata set in mono at 12px, so the eye lands on words people wrote.
 *  - Threading (items.source_parent_id) is drawn with a single left hairline per
 *    depth rung, not nested cards. Nested cards collapse into mush by depth 3.
 *  - Sentiment is a 2px edge on the left, never a badge. It is a hint the team
 *    mostly ignores, and it should cost zero attention until wanted.
 *  - The matched keyword is washed in signal amber inside the body, so you can
 *    see *why* a row is here without reading the whole thing.
 */

export type MentionData = {
	id: string;
	source: string;
	/** HN item type; other sources map onto the same two shapes. */
	type: "story" | "comment";
	author: string;
	/** Pre-split body so the matched keyword can be highlighted in place. */
	body: Array<{ text: string; match?: boolean }>;
	/** The keyword record that caused this row to be saved. */
	keyword: string;
	/** All surface forms of the keyword (term + aliases), for highlighting. */
	matchTerms: string[];
	keywordTag: Tag;
	/** Every keyword that matched, for deduped view feeds where one item can
	    match several. When present the footer credits all of them instead of
	    the single keyword/keywordTag pair. */
	matches?: { term: string; tag: Tag }[];
	/** Null until enrichment runs. */
	category: Category | null;
	sentiment?: "positive" | "negative" | "neutral";
	at: string;
	/** Canonical link back to the item on its platform. */
	permalink?: string;
	/** Thread-root context — the story a comment lives under. */
	thread?: { title: string; href: string };
	/** HN score / reactions. Optional because not every source has them. */
	score?: number;
	replies?: number;
	/** source_parent_id nesting depth. 0 = top-level item. */
	depth?: number;
};

const SENTIMENT_EDGE = {
	positive: "border-l-sentiment-positive",
	negative: "border-l-sentiment-negative",
	neutral: "border-l-sentiment-neutral",
} as const;

const COLLAPSED_PREVIEW_MAX_CHARS = 300;
const COLLAPSED_PREVIEW_MATCH_LEAD = 40;

function previewAroundFirstMatch(
	body: Array<{ text: string; match?: boolean }>,
	terms: string[],
): Array<{ text: string; match?: boolean }> {
	const full = body.map((part) => part.text).join("");
	if (full.length <= COLLAPSED_PREVIEW_MAX_CHARS) return body;

	let cursor = 0;
	let firstMatchStart = -1;
	let firstMatchEnd = -1;

	for (const part of body) {
		const next = cursor + part.text.length;
		if (part.match) {
			firstMatchStart = cursor;
			firstMatchEnd = next;
			break;
		}
		cursor = next;
	}

	if (firstMatchStart < 0 || firstMatchEnd < 0) {
		const fallback = `${full.slice(0, COLLAPSED_PREVIEW_MAX_CHARS).trimEnd()} ...`;
		return splitOnTerms(fallback, terms);
	}

	let start = Math.max(0, firstMatchStart - COLLAPSED_PREVIEW_MATCH_LEAD);
	let end = Math.min(full.length, start + COLLAPSED_PREVIEW_MAX_CHARS);

	if (firstMatchEnd > end) {
		end = firstMatchEnd;
		start = Math.max(0, end - COLLAPSED_PREVIEW_MAX_CHARS);
	}

	const prefix = start > 0 ? "... " : "";
	const suffix = end < full.length ? " ..." : "";
	const excerpt = `${prefix}${full.slice(start, end).trim()}${suffix}`;

	return splitOnTerms(excerpt, terms);
}

export function Mention({
	data,
	className,
}: {
	data: MentionData;
	className?: string;
}) {
	const depth = data.depth ?? 0;

	/* Long bodies collapse to a few lines so the timeline stays scannable;
	   the threshold keeps short comments from growing a pointless toggle. */
	const [expanded, setExpanded] = useState(false);
	const bodyLength = data.body.reduce((n, part) => n + part.text.length, 0);
	const clampable = bodyLength > 280;
	const visibleBody =
		clampable && !expanded
			? previewAroundFirstMatch(data.body, data.matchTerms)
			: data.body;

	/* A text run's identity is where it starts in the body, so key on the
	   running character offset rather than the array index. */
	let offset = 0;
	const parts = visibleBody.map((part) => {
		const key = `${offset}:${part.text.length}`;
		offset += part.text.length;
		return { ...part, key };
	});

	return (
		<article
			className={cx(
				"group relative border-b border-rule-faint transition-colors",
				"hover:bg-surface-hover/60",
				className,
			)}
		>
			{/* Thread rungs — one hairline per level of parent_id nesting. */}
			<div
				className="flex"
				style={{ paddingLeft: `calc(${depth} * var(--thread-rung))` }}
			>
				{depth > 0 && (
					<span
						className="my-3 w-px shrink-0 self-stretch bg-rule"
						aria-hidden
					/>
				)}

				<div
					className={cx(
						"min-w-0 flex-1 border-l-2 px-4 py-3",
						data.sentiment
							? SENTIMENT_EDGE[data.sentiment]
							: "border-l-transparent",
					)}
				>
					{/* Byline: everything machine-known, in mono. */}
					<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
						<SourceChip source={data.source} form="code" />
						<span className="meta text-loud">{data.author}</span>
						<span className="meta text-faint">·</span>
						{data.permalink ? (
							<a
								href={data.permalink}
								target="_blank"
								rel="noreferrer"
								className="meta hover:text-loud hover:underline"
							>
								{data.at}
							</a>
						) : (
							<span className="meta">{data.at}</span>
						)}
						{data.type === "comment" ? (
							data.thread ? (
								<a
									href={data.thread.href}
									target="_blank"
									rel="noreferrer"
									className="meta min-w-0 truncate text-muted hover:text-loud hover:underline"
									title={data.thread.title}
								>
									· on "{data.thread.title}"
								</a>
							) : (
								<span className="meta text-faint">· reply</span>
							)
						) : (
							<span className="meta text-faint">· root story</span>
						)}
						<span className="ml-auto flex items-center gap-2">
							{data.category && (
								<CategoryChip category={data.category} form="label" dot />
							)}
						</span>
					</div>

					{/* Body: the only sans-serif text in the row. */}
					<p
						className={cx(
							"mt-2 text-body",
							clampable && !expanded && "line-clamp-3",
						)}
					>
						{parts.map((part) =>
							part.match ? (
								<mark
									key={part.key}
									className="rounded-slot bg-signal-wash px-0.5 text-signal"
								>
									{part.text}
								</mark>
							) : (
								<span key={part.key}>{part.text}</span>
							),
						)}
					</p>
					{clampable && (
						<button
							type="button"
							onClick={() => setExpanded((v) => !v)}
							className="meta mt-1 cursor-pointer text-faint hover:text-loud"
						>
							{expanded ? "show less" : "show more"}
						</button>
					)}

					{/* Footer: why it matched, plus source-specific counts. */}
					<div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
						<span className="meta text-faint">matched</span>
						{(
							data.matches ?? [{ term: data.keyword, tag: data.keywordTag }]
						).map((match) => (
							<span key={match.term} className="flex items-center gap-2">
								<span className="meta font-semibold text-signal">
									{match.term}
								</span>
								<TagChip tag={match.tag} form="code" />
							</span>
						))}
						<span className="ml-auto flex items-center gap-3">
							{data.score !== undefined && (
								<span className="meta">{data.score} pts</span>
							)}
							{data.replies !== undefined && (
								<span className="meta">{data.replies} replies</span>
							)}
						</span>
					</div>
				</div>
			</div>
		</article>
	);
}
