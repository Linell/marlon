/** Minimal class joiner. Swap for clsx/tailwind-merge if variants get hairy. */
export function cx(...parts: Array<string | false | null | undefined>) {
	return parts.filter(Boolean).join(" ");
}
