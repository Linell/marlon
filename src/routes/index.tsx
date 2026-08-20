import { useInngestSubscription } from "@inngest/realtime/hooks";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "#/components/Shell";
import { Button } from "#/components/ui/Button";
import { Chip } from "#/components/ui/Chip";
import { cx } from "#/components/ui/cx";
import { EmptyState } from "#/components/ui/EmptyState";
import { Mention, type MentionData } from "#/components/ui/Mention";
import { Panel, PanelHeader } from "#/components/ui/Panel";
import {
	CATEGORIES,
	type Category,
	type Registered,
	TAGS,
	type Tag,
} from "#/components/ui/registry";
import {
	getImportActivity,
	type ImportActivityPayload,
	mintActivitySubscriptionToken,
} from "#/functions/activity";
import { listMentions, type MentionRow } from "#/functions/mentions";
import { splitOnTerm } from "#/lib/match";

export const Route = createFileRoute("/")({
	loader: async () => {
		const [mentions, activity] = await Promise.all([
			listMentions(),
			getImportActivity(),
		]);
		return { mentions, activity };
	},
	component: Home,
});

function timeAgo(date: Date, now = Date.now()): string {
	const minutes = Math.floor((now - date.getTime()) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

function asDate(value: Date | string | null | undefined): Date | null {
	if (!value) return null;
	if (value instanceof Date) return value;
	return new Date(value);
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
		permalink: row.permalink,
		thread:
			row.threadTitle && row.threadPermalink
				? { title: row.threadTitle, href: row.threadPermalink }
				: undefined,
	};
}

/* --- Filter bar --------------------------------------------------------------
   Client-side toggles over the loaded rows — at 100 rows a round-trip per
   click buys nothing. Only values present in the data get a chip; a chip is
   a toggle, and category + tag filters AND together. */

function FilterChip({
	entry,
	count,
	active,
	onToggle,
}: {
	entry: Registered;
	count: number;
	active: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-pressed={active}
			className={cx(
				"cursor-pointer transition-opacity",
				active ? "opacity-100" : "opacity-45 hover:opacity-80",
			)}
		>
			<Chip entry={entry} form="label" dot={active} className="gap-1">
				<span className="font-normal tabular-nums">{count}</span>
			</Chip>
		</button>
	);
}

function useMentionFilters(rows: MentionRow[]) {
	const [category, setCategory] = useState<Category | null>(null);
	const [tag, setTag] = useState<Tag | null>(null);

	const counts = useMemo(() => {
		const byCategory = new Map<Category, number>();
		const byTag = new Map<Tag, number>();
		for (const row of rows) {
			if (row.category) {
				const c = row.category as Category;
				byCategory.set(c, (byCategory.get(c) ?? 0) + 1);
			}
			const t = row.tag as Tag;
			byTag.set(t, (byTag.get(t) ?? 0) + 1);
		}
		return { byCategory, byTag };
	}, [rows]);

	const filtered = useMemo(
		() =>
			rows.filter(
				(row) =>
					(category === null || row.category === category) &&
					(tag === null || row.tag === tag),
			),
		[rows, category, tag],
	);

	return { category, setCategory, tag, setTag, counts, filtered };
}

type ActivityTickerItem = {
	id: number;
	kind: "progress" | "match" | "run";
	text: string;
};

type ActivityToken = Awaited<ReturnType<typeof mintActivitySubscriptionToken>>;

function ActivityTicker({
	activity,
}: {
	activity: ImportActivityPayload;
}) {
	const [lastRunSummary, setLastRunSummary] = useState(activity.lastRunSummary);
	const [now, setNow] = useState(() => Date.now());
	const [token, setToken] = useState<ActivityToken | null>(null);
	const [tokenError, setTokenError] = useState<string | null>(null);
	const [items, setItems] = useState<ActivityTickerItem[]>([]);
	const [itemIndex, setItemIndex] = useState(0);
	const itemId = useRef(0);
	const mintToken = useServerFn(mintActivitySubscriptionToken);
	const subscriptionToken = useMemo(() => {
		if (!token) return null;
		return {
			...token,
			app: { apiBaseUrl: token.apiBaseUrl },
		} as any;
	}, [token]);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		let cancelled = false;
		mintToken()
			.then((next) => {
				if (cancelled) return;
				setToken(next);
				setTokenError(null);
			})
			.catch((err) => {
				if (cancelled) return;
				setTokenError(err instanceof Error ? err.message : "Token mint failed");
			});
		return () => {
			cancelled = true;
		};
	}, [mintToken]);

	const subscription = useInngestSubscription({
		token: subscriptionToken,
		enabled: subscriptionToken !== null,
		bufferInterval: 250,
		refreshToken: async () => {
			const next = await mintToken();
			setToken(next);
			setTokenError(null);
			return {
				...next,
				app: { apiBaseUrl: next.apiBaseUrl },
			} as any;
		},
	});

	useEffect(() => {
		if (subscription.freshData.length === 0) return;

		const nextItems: ActivityTickerItem[] = [];

		for (const message of subscription.freshData) {
			switch (message.topic) {
				case "import.started":
					nextItems.push({
						id: itemId.current++,
						kind: "run",
						text: `Import started (${message.data.source})`,
					});
					break;
				case "import.progress":
					for (const title of message.data.titles) {
						nextItems.push({
							id: itemId.current++,
							kind: "progress",
							text: title,
						});
					}
					break;
				case "match.found":
					nextItems.push({
						id: itemId.current++,
						kind: "match",
						text: `${message.data.keyword} matched in ${message.data.title}`,
					});
					break;
				case "import.completed": {
					nextItems.push({
						id: itemId.current++,
						kind: "run",
						text: `Import completed (${message.data.source})`,
					});
					const completedAt =
						message.kind === "data" ? message.createdAt : new Date();
					setLastRunSummary({
						source: message.data.source,
						completedAt,
						itemsChecked: message.data.totalChecked,
						matchCount: message.data.totalMatches,
					});
					break;
				}
			}
		}

		if (nextItems.length === 0) return;

		setItems((prev) => [...prev, ...nextItems].slice(-120));
	}, [subscription.freshData]);

	useEffect(() => {
		if (items.length === 0) {
			if (itemIndex !== 0) setItemIndex(0);
			return;
		}
		if (itemIndex >= items.length) {
			setItemIndex(items.length - 1);
		}
	}, [items, itemIndex]);

	useEffect(() => {
		if (items.length <= 1 || itemIndex >= items.length - 1) return;
		const active = items[itemIndex];
		const delay = active?.kind === "match" ? 2600 : 1400;
		const timer = window.setTimeout(() => {
			setItemIndex((curr) => Math.min(curr + 1, items.length - 1));
		}, delay);
		return () => window.clearTimeout(timer);
	}, [items, itemIndex]);

	const current = items[itemIndex] ?? null;
	const completedAt = asDate(lastRunSummary?.completedAt);
	const status = lastRunSummary && completedAt
		? `Last import ${timeAgo(completedAt, now)} · ${lastRunSummary.itemsChecked} checked · ${lastRunSummary.matchCount} matches`
		: "Last import pending · 0 checked · 0 matches";

	return (
		<Panel className="mt-10 overflow-hidden">
			<PanelHeader
				title="Activity"
				aside={<span className="meta text-faint tabular-nums">{status}</span>}
			/>
			<div className="border-b border-rule-faint px-4 py-2">
				<span className="meta text-faint">
					{tokenError
						? `offline: ${tokenError}`
						: subscription.state === "active"
							? "live"
							: "connecting..."}
				</span>
			</div>
			<div className="px-4 py-3">
				{current ? (
					<p
						key={current.id}
						className={cx(
							"font-mono text-[0.8125rem] leading-relaxed text-muted",
							current.kind === "match" && "text-match-include",
						)}
					>
						{current.kind === "match" && (
							<span className="mr-2 label-caps text-match-include">match</span>
						)}
						{current.text}
					</p>
				) : (
					<p className="font-mono text-[0.8125rem] text-faint">
						Watching {activity.recentRuns.length} recent runs for the next chunk...
					</p>
				)}
			</div>
		</Panel>
	);
}

function Home() {
	const { mentions: rows, activity } = Route.useLoaderData();
	const { category, setCategory, tag, setTag, counts, filtered } =
		useMentionFilters(rows);
	const hasFilter = category !== null || tag !== null;

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

				<ActivityTicker activity={activity} />

				<Panel className="mt-16 overflow-hidden">
					<PanelHeader
						title="Mentions"
						aside={
							rows.length > 0 && (
								<span className="meta text-faint tabular-nums">
									{hasFilter ? `${filtered.length} of ` : ""}
									{rows.length} found
								</span>
							)
						}
					/>
					{rows.length > 0 && (
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-rule-faint px-4 py-2.5">
							{(Object.keys(CATEGORIES) as Category[])
								.filter((c) => counts.byCategory.has(c))
								.map((c) => (
									<FilterChip
										key={c}
										entry={CATEGORIES[c]}
										count={counts.byCategory.get(c) ?? 0}
										active={category === c}
										onToggle={() => setCategory(category === c ? null : c)}
									/>
								))}
							<span className="h-4 w-px bg-rule-faint" aria-hidden />
							{(Object.keys(TAGS) as Tag[])
								.filter((t) => counts.byTag.has(t))
								.map((t) => (
									<FilterChip
										key={t}
										entry={TAGS[t]}
										count={counts.byTag.get(t) ?? 0}
										active={tag === t}
										onToggle={() => setTag(tag === t ? null : t)}
									/>
								))}
							{hasFilter && (
								<button
									type="button"
									onClick={() => {
										setCategory(null);
										setTag(null);
									}}
									className="meta ml-auto cursor-pointer text-faint hover:text-loud"
								>
									clear
								</button>
							)}
						</div>
					)}
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
					) : filtered.length === 0 ? (
						<EmptyState
							title="No matches for this filter"
							body="Nothing loaded matches the selected category and tag."
						/>
					) : (
						<div>
							{filtered.map((row) => (
								<Mention key={row.id} data={toMentionData(row)} />
							))}
						</div>
					)}
				</Panel>
			</div>
		</Shell>
	);
}
