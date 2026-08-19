import { useState } from "react";
import { Button } from "./Button";
import { MoonIcon, SunIcon } from "./icons";

/**
 * THEME TOGGLE — flips <html data-theme>.
 *
 * This exists mostly as proof that the token architecture works: no component
 * below is aware of the theme, and nothing re-renders on the flip. Only the
 * Layer 2 role variables change, and every color in the app is downstream of
 * them via `@theme inline`.
 *
 * The icon shows the mode you will get, not the one you are in — a sun means
 * "click for day". The accessible name says the same thing in words, since an
 * icon alone is ambiguous either way you choose to read it.
 *
 * Defaults to "night" on the server so SSR markup matches first paint. If you
 * later want to persist the choice, read it in a blocking inline script and
 * stamp data-theme before hydration to avoid a flash.
 */
export function ThemeToggle() {
	const [theme, setTheme] = useState<"night" | "day">("night");
	const next = theme === "night" ? "day" : "night";

	function flip() {
		setTheme(next);
		const root = document.documentElement;
		if (next === "day") root.dataset.theme = "day";
		else delete root.dataset.theme;
	}

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={flip}
			aria-label={`Switch to ${next} theme`}
			title={`Switch to ${next} theme`}
		>
			{theme === "night" ? (
				<SunIcon className="size-4" />
			) : (
				<MoonIcon className="size-4" />
			)}
		</Button>
	);
}
