import { cx } from "./cx";
import {
	type Registered,
	category as resolveCategory,
	source as resolveSource,
	TAGS,
	type Tag,
} from "./registry";

/**
 * CHIP — the workhorse label.
 * One primitive, driven entirely by a registry entry, so a source chip and a
 * category chip are guaranteed to share metrics. Mono + uppercase because a
 * chip is a machine fact, not prose.
 */

type ChipProps = {
	entry: Registered;
	/** `code` for dense tables, `label` for roomy surfaces. */
	form?: "code" | "label";
	/** Show a leading token-colored dot. */
	dot?: boolean;
	className?: string;
	/** Trailing extras, e.g. a count in a filter chip. */
	children?: React.ReactNode;
};

export function Chip({
	entry,
	form = "label",
	dot = false,
	className,
	children,
}: ChipProps) {
	return (
		<span
			className={cx(
				"inline-flex items-center gap-1.5 rounded-slot border px-1.5 py-0.5",
				"font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em]",
				"whitespace-nowrap align-middle",
				entry.chip,
				className,
			)}
		>
			{dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
			{form === "code" ? entry.code : entry.label}
			{children}
		</span>
	);
}

/* Thin wrappers. They exist so call sites read as domain language
   (<SourceChip source="hackernews" />) rather than registry plumbing. */

export const SourceChip = ({
	source,
	...rest
}: { source: string } & Omit<ChipProps, "entry">) => (
	<Chip entry={resolveSource(source)} {...rest} />
);

export const TagChip = ({
	tag,
	...rest
}: { tag: Tag } & Omit<ChipProps, "entry">) => (
	<Chip entry={TAGS[tag]} {...rest} />
);

export const CategoryChip = ({
	category,
	...rest
}: { category: string } & Omit<ChipProps, "entry">) => (
	<Chip entry={resolveCategory(category)} {...rest} />
);
