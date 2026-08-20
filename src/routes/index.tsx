import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "#/components/Shell";
import { Button } from "#/components/ui/Button";
import { EmptyState } from "#/components/ui/EmptyState";
import { Mention, type MentionData } from "#/components/ui/Mention";
import { Panel, PanelHeader } from "#/components/ui/Panel";
import type { Category, Tag } from "#/components/ui/registry";
import { listMentions, type MentionRow } from "#/functions/mentions";
import { splitOnTerm } from "#/lib/match";

export const Route = createFileRoute("/")({
	loader: () => listMentions(),
	component: Home,
});

function timeAgo(date: Date): string {
	const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

/** Whichever field the keyword actually matched, so the highlight shows. */
function matchedBody(row: MentionRow): string {
	const [primary, secondary] =
		row.type === "comment"
			? [row.bodyText, row.title]
			: [row.title, row.bodyText];
	for (const text of [primary, secondary]) {
		if (text && splitOnTerm(text, row.term).some((run) => run.match)) {
			return text;
		}
	}
	return primary ?? secondary ?? "";
}

function toMentionData(row: MentionRow): MentionData {
	return {
		id: row.id,
		source: row.source,
		type: row.type === "comment" ? "comment" : "story",
		author: row.author ?? "unknown",
		body: splitOnTerm(matchedBody(row), row.term),
		keyword: row.term,
		keywordTag: row.tag as Tag,
		category: row.category as Category | null,
		at: timeAgo(row.postedAt ?? row.createdAt),
	};
}

function Home() {
	const rows = Route.useLoaderData();

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
					<PanelHeader
						title="Mentions"
						aside={
							rows.length > 0 && (
								<span className="meta text-faint tabular-nums">
									{rows.length} found
								</span>
							)
						}
					/>
					{rows.length === 0 ? (
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
					) : (
						<div>
							{rows.map((row) => (
								<Mention key={row.id} data={toMentionData(row)} />
							))}
						</div>
					)}
				</Panel>
			</div>
		</Shell>
	);
}
