import { createFileRoute } from "@tanstack/react-router";
import { Button } from "#/components/ui/Button";
import { EmptyState } from "#/components/ui/EmptyState";
import { Panel, PanelHeader } from "#/components/ui/Panel";
import { ThemeToggle } from "#/components/ui/ThemeToggle";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<div className="flex min-h-dvh flex-col text-body">
			<TopBar />

			<main className="flex-1">
				<div className="mx-auto max-w-5xl px-6 py-24 md:py-32">
					<div className="flex items-center gap-2.5">
						<span className="label-caps">Powered By</span>
						<span className="h-px w-4 bg-rule-loud" aria-hidden />
						<span className="label-caps text-signal-dim">Inngest</span>
					</div>

					<h1 className="mt-6 max-w-2xl text-4xl font-extrabold tracking-tight text-loud md:text-5xl">
						Dogfood has never tasted so good.
					</h1>

					<p className="mt-5 max-w-xl text-lg text-muted">
						Marlon watches for the words that matter to your Brando.
					</p>

					<Panel className="mt-16 overflow-hidden">
						<PanelHeader title="Mentions" />
						<EmptyState
							title="Nothing here yet"
							body="Once a keyword is tracked and a source is connected, matches land in this panel."
							action={
								<Button variant="quiet" size="sm">
									Add a keyword
								</Button>
							}
						/>
					</Panel>
				</div>
			</main>

			<Footer />
		</div>
	);
}

function TopBar() {
	return (
		<header className="sticky top-0 z-10 border-b border-rule bg-surface/85 backdrop-blur-md">
			<div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
				<a href="/" className="flex items-baseline gap-2">
					<span className="font-mono text-base font-extrabold uppercase tracking-[0.22em] text-loud">
						Marlon
					</span>
					<span className="hidden text-[0.625rem] uppercase tracking-[0.18em] text-faint sm:inline">
						Home
					</span>
				</a>

				<nav className="ml-auto flex items-center gap-1">
					{/* <a */}
					{/* 	href="/style" */}
					{/* 	className="rounded-slot px-2.5 py-1 font-mono text-[0.75rem] uppercase tracking-[0.1em] text-muted transition-colors hover:text-loud" */}
					{/* > */}
					{/* 	Style */}
					{/* </a> */}
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
