import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "#/components/Shell";
import { Button } from "#/components/ui/Button";
import { EmptyState } from "#/components/ui/EmptyState";
import { Panel, PanelHeader } from "#/components/ui/Panel";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<Shell>
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
							<Link to="/keywords">
								<Button variant="quiet" size="sm">
									Add a keyword
								</Button>
							</Link>
						}
					/>
				</Panel>
			</div>
		</Shell>
	);
}
