import { cx } from "./cx";

/**
 * BUTTON — three intents, one geometry.
 * `signal` is the amber primary and should appear at most once per view;
 * amber means "live/act now", and two primaries mean neither is primary.
 */

type Variant = "signal" | "quiet" | "ghost";
type Size = "sm" | "md" | "icon";

const VARIANTS: Record<Variant, string> = {
	signal:
		"bg-signal text-on-signal border-signal hover:bg-signal-hover hover:border-signal-hover",
	quiet:
		"bg-surface-raised text-body border-rule hover:bg-surface-hover hover:border-rule-loud",
	ghost:
		"bg-transparent text-muted border-transparent hover:bg-surface-hover hover:text-body",
};

const SIZES: Record<Size, string> = {
	sm: "h-7 px-2.5 text-[0.75rem]",
	md: "h-9 px-3.5 text-[0.8125rem]",
	/* Square, and matched to `sm` height so it lines up in a toolbar. */
	icon: "size-7 px-0",
};

type ButtonProps = React.ComponentPropsWithoutRef<"button"> & {
	variant?: Variant;
	size?: Size;
};

export function Button({
	variant = "quiet",
	size = "md",
	className,
	...rest
}: ButtonProps) {
	return (
		<button
			type="button"
			className={cx(
				"inline-flex items-center justify-center gap-2 rounded-slot border",
				"font-mono font-semibold uppercase tracking-[0.08em]",
				"transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45",
				VARIANTS[variant],
				SIZES[size],
				className,
			)}
			{...rest}
		/>
	);
}
