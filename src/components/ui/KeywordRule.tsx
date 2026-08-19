import { TagChip } from "./Chip";
import { cx } from "./cx";
import type { Tag } from "./registry";

/**
 * KEYWORD RULE — renders one keyword's match logic, including the negative case.
 *
 * The include/exclude distinction is the subtlest thing in the product ("match
 * Temporal, but not brain or lobe"), so it gets redundant encoding: color,
 * a +/− operator glyph, AND strikethrough on exclusions. Color alone would
 * fail for anyone with a red/green deficiency.
 */

export function KeywordRule({
	keyword,
	tag,
	include = [],
	exclude = [],
	className,
}: {
	keyword: string;
	tag: Tag;
	include?: string[];
	exclude?: string[];
	className?: string;
}) {
	return (
		<div
			className={cx("flex flex-wrap items-center gap-2 px-4 py-3", className)}
		>
			<span className="font-mono text-sm font-bold text-loud">{keyword}</span>
			<TagChip tag={tag} form="label" />

			<span className="ml-auto flex flex-wrap items-center gap-1.5">
				{include.map((term) => (
					<Term key={term} term={term} kind="include" />
				))}
				{exclude.map((term) => (
					<Term key={term} term={term} kind="exclude" />
				))}
			</span>
		</div>
	);
}

function Term({ term, kind }: { term: string; kind: "include" | "exclude" }) {
	const isExclude = kind === "exclude";
	return (
		<span
			className={cx(
				"inline-flex items-center gap-1 rounded-slot border px-1.5 py-0.5",
				"font-mono text-[0.6875rem] tracking-[0.02em]",
				isExclude
					? "border-match-exclude/30 bg-match-exclude/10 text-match-exclude"
					: "border-match-include/30 bg-match-include/10 text-match-include",
			)}
		>
			<span aria-hidden className="font-bold">
				{isExclude ? "−" : "+"}
			</span>
			<span className={isExclude ? "line-through decoration-1" : undefined}>
				{term}
			</span>
			<span className="sr-only">{isExclude ? " excluded" : " required"}</span>
		</span>
	);
}
