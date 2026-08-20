import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "#/components/ui/ThemeToggle";

/**
 * SHELL — the shared page chrome.
 * Route wrapper is `flex min-h-dvh flex-col` with a `flex-1` main so the
 * footer pins to the bottom on short pages, and the wrapper itself stays
 * transparent so the ledger grid shows through (see DESIGN.md).
 */

export function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col text-body">
			<TopBar />
			<main className="flex-1">{children}</main>
			<Footer />
		</div>
	);
}

const NAV = [
	{ to: "/", label: "Mentions" },
	{ to: "/keywords", label: "Keywords" },
	{ to: "/views", label: "Views" },
] as const;

function TopBar() {
	return (
		<header className="sticky top-0 z-10 border-b border-rule bg-surface/85 backdrop-blur-md">
			<div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
				<Link to="/" className="flex items-baseline gap-2">
					<span className="font-mono text-base font-extrabold uppercase tracking-[0.22em] text-loud">
						Marlon
					</span>
				</Link>

				<nav className="ml-auto flex items-center gap-1">
					{NAV.map(({ to, label }) => (
						<Link
							key={to}
							to={to}
							className="rounded-slot px-2.5 py-1 font-mono text-[0.75rem] uppercase tracking-[0.1em] text-muted transition-colors hover:text-loud"
							activeProps={{ className: "text-loud" }}
							activeOptions={{ exact: to === "/" }}
						>
							{label}
						</Link>
					))}
					<ThemeToggle />
				</nav>
			</div>
		</header>
	);
}

function Footer() {
	return (
		<footer className="border-t border-rule bg-surface">
			<div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-6">
				<div>
					<div className="font-mono text-sm font-extrabold uppercase tracking-[0.22em] text-loud">
						Marlon
					</div>
					<p className="meta mt-1.5 text-faint">
						Powered by <a href="https://inngest.com">Inngest</a>
					</p>
				</div>
				<span className="meta text-faint">v0.1</span>
			</div>
		</footer>
	);
}
