import { createFileRoute } from "@tanstack/react-router";
import { Button } from "#/components/ui/Button";
import { ComparisonChart, Sparkline } from "#/components/ui/Chart";
import { CategoryChip, SourceChip, TagChip } from "#/components/ui/Chip";
import { EmptyState } from "#/components/ui/EmptyState";
import { KeywordRule } from "#/components/ui/KeywordRule";
import { Mention, type MentionData } from "#/components/ui/Mention";
import { Panel, PanelHeader } from "#/components/ui/Panel";
import { CATEGORIES, SOURCES, TAGS } from "#/components/ui/registry";
import { ThemeToggle } from "#/components/ui/ThemeToggle";
import { ViewCard, type ViewCardData } from "#/components/ViewCard";

export const Route = createFileRoute("/style")({ component: StyleGuide });

/**
 * STYLE REFERENCE — the only place sample data belongs.
 *
 * Every registry is rendered by mapping over it, so a token added to
 * tokens.css + theme.css + registry.ts shows up here automatically instead of
 * going quietly unused. Two mentions is enough to exercise threading; resist
 * growing this into a fake product.
 *
 * Safe to delete wholesale if you'd rather not carry it.
 */

const SAMPLE: MentionData[] = [
	{
		id: "1",
		source: "hackernews",
		type: "story",
		author: "sample_user",
		body: [
			{ text: "Show HN: I replaced my queue glue with " },
			{ text: "Inngest", match: true },
		],
		keyword: "inngest",
		matchTerms: ["inngest"],
		keywordTag: "own",
		category: "praise",
		sentiment: "positive",
		at: "12m",
		score: 284,
		replies: 96,
		depth: 0,
	},
	{
		id: "2",
		source: "hackernews",
		type: "comment",
		author: "another_user",
		body: [
			{ text: "Is " },
			{ text: "Mercury", match: true },
			{ text: " retrograde to blame for these long-running workflows?" },
		],
		keyword: "mercury",
		matchTerms: ["mercury", "hermes"],
		keywordTag: "competitor",
		category: "question",
		sentiment: "neutral",
		at: "9m",
		score: 41,
		depth: 1,
	},
];

/* --- Chart sample data --------------------------------------------------------
   Deterministic waves rather than randomness, so the reference page renders
   the same on every visit. Sparse is the specimen that matters most: the dev
   DB is nearly empty, and the y-floor has to keep one mention from reading as
   a cliff. */

const CHART_DATES = Array.from({ length: 30 }, (_, i) =>
	new Date(Date.UTC(2026, 6, 22 + i)).toISOString().slice(0, 10),
);

const wave = (i: number, seed: number) =>
	Math.max(
		0,
		Math.round(3 + 2.5 * Math.sin((i + seed) / 3) + ((i * seed) % 4) - 1),
	);

const HEALTHY_SERIES = [
	{
		keywordId: "s1",
		term: "inngest",
		counts: CHART_DATES.map((_, i) => wave(i, 2)),
	},
	{
		keywordId: "s2",
		term: "mercury",
		counts: CHART_DATES.map((_, i) => wave(i, 7)),
	},
	{
		keywordId: "s3",
		term: "workflows",
		counts: CHART_DATES.map((_, i) => wave(i, 12)),
	},
];

/* Total is distinct items, so it sits between the largest series and the sum. */
const HEALTHY_TOTAL = CHART_DATES.map((_, i) => {
	const per = HEALTHY_SERIES.map((s) => s.counts[i]);
	const max = Math.max(...per);
	const sum = per.reduce((a, b) => a + b, 0);
	return max + Math.floor((sum - max) / 2);
});

const SPARSE_SERIES = [
	{
		keywordId: "s1",
		term: "quicksilver",
		counts: CHART_DATES.map((_, i) => (i === 21 ? 1 : 0)),
	},
];

const VIEW_CARDS: ViewCardData[] = [
	{
		id: "sample-healthy",
		name: "Competitive set",
		keywords: [
			{ id: "k1", term: "inngest", tag: "own" },
			{ id: "k2", term: "mercury", tag: "competitor" },
			{ id: "k3", term: "workflows", tag: "topic" },
		],
		mentionCount: HEALTHY_TOTAL.reduce((a, b) => a + b, 0),
		spark: HEALTHY_TOTAL,
	},
	{
		id: "sample-sparse",
		name: "Launch watch",
		keywords: [{ id: "k4", term: "quicksilver", tag: "ecosystem" }],
		mentionCount: 1,
		spark: SPARSE_SERIES[0].counts,
	},
];

function StyleGuide() {
	return (
		<div className="flex min-h-dvh flex-col text-body">
			<header className="sticky top-0 z-10 border-b border-rule bg-surface/85 backdrop-blur-md">
				<div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-6">
					<a
						href="/"
						className="font-mono text-base font-extrabold uppercase tracking-[0.22em] text-loud"
					>
						Marlon
					</a>
					<span className="label-caps">style reference</span>
					<div className="ml-auto">
						<ThemeToggle />
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-6 py-12">
				<Section title="Sources">
					{Object.keys(SOURCES).map((key) => (
						<SourceChip key={key} source={key} />
					))}
				</Section>

				<Section title="Keyword tags">
					{Object.keys(TAGS).map((key) => (
						<TagChip key={key} tag={key as keyof typeof TAGS} />
					))}
				</Section>

				<Section title="Categories">
					{Object.keys(CATEGORIES).map((key) => (
						<CategoryChip key={key} category={key as keyof typeof CATEGORIES} />
					))}
				</Section>

				<Section title="Buttons">
					<Button variant="signal">Signal</Button>
					<Button variant="quiet">Quiet</Button>
					<Button variant="ghost">Ghost</Button>
					<Button variant="quiet" disabled>
						Disabled
					</Button>
				</Section>

				<Panel className="overflow-hidden">
					<PanelHeader title="Keyword rules — include / exclude" />
					<div className="divide-y divide-rule-faint">
						<KeywordRule keyword="inngest" tag="own" exclude={["ingest"]} />
						<KeywordRule
							keyword="mercury"
							aliases={["hermes", "quicksilver"]}
							tag="competitor"
							include={["planet", "retrograde"]}
							exclude={["car", "dealership"]}
						/>
					</div>
				</Panel>

				<Panel className="overflow-hidden">
					<PanelHeader title="Mentions — threading and matched keywords" />
					{SAMPLE.map((m) => (
						<Mention key={m.id} data={m} />
					))}
				</Panel>

				<Panel className="overflow-hidden">
					<PanelHeader title="Comparison chart — healthy, multi-series with tooltip" />
					<div className="px-4 pt-4 pb-3">
						<ComparisonChart
							dates={CHART_DATES}
							series={HEALTHY_SERIES}
							total={HEALTHY_TOTAL}
						/>
					</div>
				</Panel>

				<Panel className="overflow-hidden">
					<PanelHeader title="Comparison chart — sparse, one mention in the window" />
					<div className="px-4 pt-4 pb-3">
						<ComparisonChart
							dates={CHART_DATES}
							series={SPARSE_SERIES}
							total={SPARSE_SERIES[0].counts}
						/>
					</div>
				</Panel>

				<Section title="Sparklines — healthy / sparse (all-zero renders nothing)">
					<Sparkline counts={HEALTHY_TOTAL} />
					<Sparkline counts={SPARSE_SERIES[0].counts} />
					<Sparkline counts={CHART_DATES.map(() => 0)} />
				</Section>

				<Panel className="overflow-hidden">
					<PanelHeader title="View cards — healthy / sparse" />
					<div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
						{VIEW_CARDS.map((view) => (
							<ViewCard key={view.id} view={view} />
						))}
					</div>
				</Panel>

				<Panel className="overflow-hidden">
					<PanelHeader title="Empty state" />
					<EmptyState
						title="Nothing here yet"
						body="What a panel shows before it has data."
					/>
				</Panel>

				<Section title="Type">
					<div className="w-full space-y-2">
						<h1 className="text-4xl font-extrabold tracking-tight text-loud">
							Display — Atkinson Hyperlegible Next
						</h1>
						<p className="text-lg text-muted">
							Body copy. Sans is for words a human wrote.
						</p>
						<p className="meta">
							meta — 2026-08-19 14:32:07 · @handle · 1,284 pts
						</p>
						<p className="label-caps">label-caps — section eyebrow</p>
					</div>
				</Section>
			</main>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Panel className="overflow-hidden">
			<PanelHeader title={title} />
			<div className="flex flex-wrap items-center gap-2 px-4 py-4">
				{children}
			</div>
		</Panel>
	);
}
