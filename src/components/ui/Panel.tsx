import { cx } from "./cx";

/**
 * PANEL — the boxed container everything sits in.
 * A wire room is built from rules and boxes, so panels lean on hairlines
 * rather than shadows. `PanelHeader` gives every panel the same eyebrow row.
 */

export function Panel({
	className,
	children,
	...rest
}: React.ComponentPropsWithoutRef<"section">) {
	return (
		<section
			className={cx(
				"rounded-panel border border-rule bg-surface-raised",
				className,
			)}
			{...rest}
		>
			{children}
		</section>
	);
}

export function PanelHeader({
	title,
	aside,
	className,
}: {
	title: string;
	aside?: React.ReactNode;
	className?: string;
}) {
	return (
		<header
			className={cx(
				"flex items-center justify-between gap-3 border-b border-rule-faint px-4 py-2.5",
				className,
			)}
		>
			<h2 className="label-caps">{title}</h2>
			{aside}
		</header>
	);
}
