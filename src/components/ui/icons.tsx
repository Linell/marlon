/**
 * ICONS — inline SVG, no dependency.
 *
 * House rules so a growing set stays coherent:
 *  - 24x24 viewBox, 1.5 stroke, round caps/joins, `fill="none"`.
 *  - Stroke is `currentColor`, so an icon inherits whatever text color it sits
 *    in and needs no token of its own.
 *  - Sized by the caller via `className` (`size-4`, `size-5`), never hardcoded.
 *  - Always `aria-hidden`; the accessible name belongs on the button.
 */

type IconProps = { className?: string };

const base = {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.5,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

export function SunIcon({ className }: IconProps) {
	return (
		<svg {...base} aria-hidden="true" className={className}>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
		</svg>
	);
}

export function MoonIcon({ className }: IconProps) {
	return (
		<svg {...base} aria-hidden="true" className={className}>
			<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
		</svg>
	);
}
