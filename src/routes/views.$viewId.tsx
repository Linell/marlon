import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "#/components/Shell";
import { Button } from "#/components/ui/Button";
import { ComparisonChart } from "#/components/ui/Chart";
import { EmptyState } from "#/components/ui/EmptyState";
import { Mention } from "#/components/ui/Mention";
import { Panel, PanelHeader } from "#/components/ui/Panel";
import type { Tag } from "#/components/ui/registry";
import { KeywordChip } from "#/components/ViewCard";
import {
	getMentionTimeseries,
	listMentionsForKeywords,
} from "#/functions/mentions";
import { getView } from "#/functions/views";
import { toViewMentionData } from "#/lib/mention-view";

export const Route = createFileRoute("/views/$viewId")({
	loader: async ({ params }) => {
		const view = await getView({ data: { id: params.viewId } });
		if (!view) return { view: null, timeseries: null, feed: [] };

		const keywordIds = view.keywords.map((k) => k.id);
		const [timeseries, feed] = await Promise.all([
			getMentionTimeseries({ data: { keywordIds } }),
			listMentionsForKeywords({ data: { keywordIds } }),
		]);
		return { view, timeseries, feed };
	},
	component: ViewDetailPage,
});

function ViewDetailPage() {
	const { view, timeseries, feed } = Route.useLoaderData();

	if (!view || !timeseries) {
		return (
			<Shell>
				<div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
					<Panel className="overflow-hidden">
						<EmptyState
							title="View not found"
							body="It may have been removed."
							action={
								<Link to="/views">
									<Button variant="quiet" size="sm">
										Back to views
									</Button>
								</Link>
							}
						/>
					</Panel>
				</div>
			</Shell>
		);
	}

	const windowCount = timeseries.total.reduce((sum, n) => sum + n, 0);

	return (
		<Shell>
			<div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
				<div className="flex items-baseline gap-3">
					<Link to="/views" className="meta text-faint hover:text-loud">
						Views /
					</Link>
					<h1 className="text-2xl font-extrabold tracking-tight text-loud">
						{view.name}
					</h1>
				</div>
				{view.keywords.length > 0 && (
					<div className="mt-3 flex flex-wrap gap-1.5">
						{view.keywords.map((keyword) => (
							<KeywordChip
								key={keyword.id}
								term={keyword.term}
								tag={keyword.tag as Tag}
							/>
						))}
					</div>
				)}

				<Panel className="mt-8 overflow-hidden">
					<PanelHeader
						title="Mention Volume"
						aside={
							<span className="meta text-faint tabular-nums">
								{windowCount} {windowCount === 1 ? "mention" : "mentions"} · 30d
							</span>
						}
					/>
					{windowCount === 0 ? (
						<EmptyState
							title="Quiet month"
							body="No mentions of these keywords in the last 30 days."
						/>
					) : (
						<div className="px-4 pt-4 pb-3">
							<ComparisonChart
								dates={timeseries.dates}
								series={timeseries.series}
								total={timeseries.total}
							/>
						</div>
					)}
				</Panel>

				<Panel className="mt-6 overflow-hidden">
					<PanelHeader
						title="Mentions"
						aside={
							<span className="meta text-faint tabular-nums">
								{feed.length} shown
							</span>
						}
					/>
					{feed.length === 0 ? (
						<EmptyState
							title="Nothing here yet"
							body={
								view.keywords.length === 0
									? "This view has no keywords. Edit it and pick a few."
									: "No stored mentions match this view's keywords yet."
							}
						/>
					) : (
						<div>
							{feed.map((row) => (
								<Mention key={row.itemId} data={toViewMentionData(row)} />
							))}
						</div>
					)}
				</Panel>
			</div>
		</Shell>
	);
}
