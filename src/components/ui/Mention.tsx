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
	keywordTag: Tag;
	/** Null until enrichment runs. */
	category: Category | null;
	sentiment?: "positive" | "negative" | "neutral";
	at: string;
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

export function Mention({
	data,
	className,
}: {
	data: MentionData;
	className?: string;
}) {
	const depth = data.depth ?? 0;

	/* A text run's identity is where it starts in the body, so key on the
	   running character offset rather than the array index. */
	let offset = 0;
	const parts = data.body.map((part) => {
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
						<span className="meta">{data.at}</span>
						{data.type === "comment" && (
							<span className="meta text-faint">· reply</span>
						)}
						<span className="ml-auto flex items-center gap-2">
							{data.category && (
								<CategoryChip category={data.category} form="code" />
							)}
						</span>
					</div>

					{/* Body: the only sans-serif text in the row. */}
					<p className="mt-2 text-body">
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

					{/* Footer: why it matched, plus source-specific counts. */}
					<div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
						<span className="meta text-faint">matched</span>
						<span className="meta font-semibold text-signal">
							{data.keyword}
						</span>
						<TagChip tag={data.keywordTag} form="code" />
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
