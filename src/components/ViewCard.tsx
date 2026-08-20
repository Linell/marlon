import { Link } from "@tanstack/react-router";
import { Sparkline } from "#/components/ui/Chart";
import { cx } from "#/components/ui/cx";
import { Panel } from "#/components/ui/Panel";
import { TAGS, type Tag } from "#/components/ui/registry";

/**
 * VIEW CARD — one saved reading lens.
 * Count and sparkline cover the same 30-day window as the detail chart, so a
 * card never disagrees with the page it links to. A view with no mentions in
 * the window drops its sparkline rather than drawing a flat line.
 */

export type ViewCardData = {
	id: string;
	name: string;
	keywords: { id: string; term: string; tag: string }[];
	/** Distinct items across all member keywords, last 30 days. */
	mentionCount: number;
	spark: number[];
};

export function ViewCard({
	view,
	actions,
}: {
	view: ViewCardData;
	actions?: React.ReactNode;
}) {
	return (
		<Panel className="flex flex-col gap-3 px-4 py-4">
			<div className="flex items-center justify-between gap-3">
				<Link
					to="/views/$viewId"
					params={{ viewId: view.id }}
					className="min-w-0 truncate font-semibold text-loud hover:underline"
				>
					{view.name}
				</Link>
				{actions}
			</div>

			{view.keywords.length === 0 ? (
				<span className="meta text-faint">no keywords yet</span>
			) : (
				<div className="flex flex-wrap gap-1.5">
					{view.keywords.map((keyword) => (
						<KeywordChip
							key={keyword.id}
							term={keyword.term}
							tag={keyword.tag as Tag}
						/>
					))}
				</div>
			)}

			<div className="mt-auto flex items-end justify-between gap-3 pt-1">
				<span className="meta tabular-nums">
					{view.mentionCount} {view.mentionCount === 1 ? "mention" : "mentions"}{" "}
					· 30d
				</span>
				<Sparkline counts={view.spark} />
			</div>
		</Panel>
	);
}

/** A keyword term wearing its tag's colors — denser than a full KeywordRule. */
export function KeywordChip({ term, tag }: { term: string; tag: Tag }) {
	return (
		<span
			className={cx(
				"inline-flex items-center rounded-slot border px-1.5 py-0.5",
				"font-mono text-[0.6875rem] tracking-[0.02em]",
				TAGS[tag].chip,
			)}
		>
			{term}
		</span>
	);
}
