import { cx } from "./cx";

/**
 * EMPTY STATE — the honest default.
 *
 * Marlon starts with nothing in it and will have quiet stretches after that, so
 * empty is a first-class state rather than an afterthought. Reach for this
 * instead of seeding a panel with placeholder rows.
 */
export function EmptyState({
	title,
	body,
	action,
	className,
}: {
	title: string;
	body?: string;
	action?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cx(
				"flex flex-col items-center gap-3 px-6 py-14 text-center",
				className,
			)}
		>
			{/* A single rule instead of an illustration. Cheap, and on-theme. */}
			<span className="h-px w-8 bg-rule-loud" aria-hidden />
			<div>
				<div className="font-semibold text-loud">{title}</div>
				{body && (
					<p className="mx-auto mt-1.5 max-w-sm text-[0.875rem] text-muted">
						{body}
					</p>
				)}
			</div>
			{action}
		</div>
	);
}
