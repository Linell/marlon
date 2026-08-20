import type { Realtime } from "@inngest/realtime";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "#/components/Shell";
import { Button } from "#/components/ui/Button";
import { Chip } from "#/components/ui/Chip";
import { cx } from "#/components/ui/cx";
import { EmptyState } from "#/components/ui/EmptyState";
import { Mention } from "#/components/ui/Mention";
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
import {
	listMentions,
	listMentionsByIds,
	type MentionRow,
} from "#/functions/mentions";
import { asDate, timeAgo, toMentionData } from "#/lib/mention-view";

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

function mentionCreatedAtMs(row: MentionRow): number {
	const createdAt = asDate(row.createdAt);
	return createdAt ? createdAt.getTime() : 0;
}

function upsertMentionRows(
	rows: MentionRow[],
	incoming: MentionRow[],
): MentionRow[] {
	if (incoming.length === 0) return rows;

	const byId = new Map<string, MentionRow>();
	for (const row of rows) byId.set(row.id, row);
	for (const row of incoming) byId.set(row.id, row);

	return [...byId.values()]
		.sort((a, b) => mentionCreatedAtMs(b) - mentionCreatedAtMs(a))
		.slice(0, 100);
}

function applyMentionCategoryUpdates(
	rows: MentionRow[],
	updates: Map<string, string>,
): MentionRow[] {
	if (updates.size === 0) return rows;

	let changed = false;
	const next = rows.map((row) => {
		const category = updates.get(row.id);
		if (category === undefined || row.category === category) return row;
		changed = true;
		return { ...row, category: category as MentionRow["category"] };
	});

	return changed ? next : rows;
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
type ActivitySubscriptionToken = ActivityToken & {
	app: { apiBaseUrl: string };
};
type ActivitySubscription = ReturnType<typeof useInngestSubscription>;
type ActivityMessage = ActivitySubscription["freshData"][number];
type ActivityState = ActivitySubscription["state"];

type LiveIndicator = {
	label: "live" | "connecting" | "offline";
	bubbleClassName: string;
	dotClassName: string;
};

function ActivityTicker({
	activity,
	freshData,
	subscriptionState,
	tokenError,
}: {
	activity: ImportActivityPayload;
	freshData: ActivityMessage[];
	subscriptionState: ActivityState;
	tokenError: string | null;
}) {
	const [lastRunSummary, setLastRunSummary] = useState(activity.lastRunSummary);
	const [now, setNow] = useState(() => Date.now());
	const [items, setItems] = useState<ActivityTickerItem[]>([]);
	const [itemIndex, setItemIndex] = useState(0);
	const itemId = useRef(0);

	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		setLastRunSummary(activity.lastRunSummary);
	}, [activity.lastRunSummary]);

	useEffect(() => {
		if (freshData.length === 0) return;

		const nextItems: ActivityTickerItem[] = [];

		for (const message of freshData) {
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
	}, [freshData]);

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
	const status =
		lastRunSummary && completedAt
			? `Last import ${timeAgo(completedAt, now)} · ${lastRunSummary.itemsChecked} checked · ${lastRunSummary.matchCount} matches`
			: "Last import pending · 0 checked · 0 matches";
	const idleTickerText = tokenError
		? "Live activity unavailable"
		: subscriptionState === "active"
			? "No live import activity right now"
			: "Connecting to live activity...";
	const liveIndicator: LiveIndicator = tokenError
		? {
				label: "offline",
				bubbleClassName:
					"border-match-exclude/40 bg-match-exclude/10 text-match-exclude",
				dotClassName: "bg-match-exclude",
			}
		: subscriptionState === "active"
			? {
					label: "live",
					bubbleClassName:
						"border-match-include/40 bg-match-include/12 text-match-include",
					dotClassName: "bg-match-include",
				}
			: {
					label: "connecting",
					bubbleClassName: "border-rule bg-surface text-faint",
					dotClassName: "bg-faint",
				};

	return (
		<Panel className="mt-10 overflow-hidden">
			<PanelHeader
				title="Activity"
				aside={
					<span className="flex items-center gap-2">
						<span className="meta text-faint tabular-nums">{status}</span>
						<span
							className={cx(
								"meta inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
								"text-[0.625rem] tracking-[0.12em] uppercase",
								liveIndicator.bubbleClassName,
							)}
						>
							<span
								className={cx(
									"h-1.5 w-1.5 rounded-full",
									liveIndicator.dotClassName,
								)}
							/>
							{liveIndicator.label}
						</span>
					</span>
				}
			/>
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
						{idleTickerText}
					</p>
				)}
			</div>
		</Panel>
	);
}

function Home() {
	const { mentions: loaderMentions, activity } = Route.useLoaderData();
	const mintToken = useServerFn(mintActivitySubscriptionToken);
	const listMentionsByIdsFn = useServerFn(listMentionsByIds);
	const [rows, setRows] = useState<MentionRow[]>(() => loaderMentions);
	const [token, setToken] = useState<ActivityToken | null>(null);
	const [tokenError, setTokenError] = useState<string | null>(null);
	const [freshMentionIds, setFreshMentionIds] = useState<Set<string>>(
		() => new Set(),
	);
	const rowIdsRef = useRef<Set<string>>(
		new Set(loaderMentions.map((row) => row.id)),
	);
	const mentionCreatedIds = useRef<Set<string>>(new Set());
	const mentionCreatedFlushTimer = useRef<number | null>(null);
	const mentionHighlightTimers = useRef<Map<string, number>>(new Map());
	const subscriptionToken = useMemo<ActivitySubscriptionToken | null>(() => {
		if (!token) return null;
		return {
			...token,
			app: { apiBaseUrl: token.apiBaseUrl },
		};
	}, [token]);
	const subscription = useInngestSubscription({
		token: subscriptionToken as unknown as Realtime.Subscribe.Token | null,
		enabled: subscriptionToken !== null,
		bufferInterval: 250,
		refreshToken: async () => {
			const next = await mintToken();
			setToken(next);
			setTokenError(null);
			const nextToken: ActivitySubscriptionToken = {
				...next,
				app: { apiBaseUrl: next.apiBaseUrl },
			};
			return nextToken as unknown as Realtime.Subscribe.Token;
		},
	});

	useEffect(() => {
		setRows(loaderMentions);
		rowIdsRef.current = new Set(loaderMentions.map((row) => row.id));
	}, [loaderMentions]);

	useEffect(() => {
		rowIdsRef.current = new Set(rows.map((row) => row.id));
	}, [rows]);

	const markFreshMentions = useCallback((ids: string[]) => {
		if (ids.length === 0) return;

		setFreshMentionIds((current) => {
			const next = new Set(current);
			for (const id of ids) next.add(id);
			return next;
		});

		for (const id of ids) {
			const previousTimer = mentionHighlightTimers.current.get(id);
			if (previousTimer !== undefined) {
				window.clearTimeout(previousTimer);
			}

			const timer = window.setTimeout(() => {
				mentionHighlightTimers.current.delete(id);
				setFreshMentionIds((current) => {
					if (!current.has(id)) return current;
					const next = new Set(current);
					next.delete(id);
					return next;
				});
			}, 1800);

			mentionHighlightTimers.current.set(id, timer);
		}
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

	const flushMentionCreatedQueue = useCallback(async () => {
		mentionCreatedFlushTimer.current = null;
		const ids = [...mentionCreatedIds.current];
		mentionCreatedIds.current.clear();
		if (ids.length === 0) return;

		try {
			const freshRows = await listMentionsByIdsFn({ data: { ids } });
			const insertedIds = freshRows
				.map((row) => row.id)
				.filter((id) => !rowIdsRef.current.has(id));
			if (insertedIds.length > 0) {
				markFreshMentions(insertedIds);
			}
			setRows((current) => upsertMentionRows(current, freshRows));
		} catch {
			for (const id of ids) {
				mentionCreatedIds.current.add(id);
			}
		}
	}, [listMentionsByIdsFn, markFreshMentions]);

	useEffect(() => {
		if (subscription.freshData.length === 0) return;

		const categoryUpdates = new Map<string, string>();
		let hasCreatedMentions = false;

		for (const message of subscription.freshData) {
			if (message.topic === "mention.created") {
				const mentionId = message.data?.mentionId;
				if (typeof mentionId === "string" && mentionId.length > 0) {
					mentionCreatedIds.current.add(mentionId);
					hasCreatedMentions = true;
				}
				continue;
			}

			if (message.topic === "mention.categorized") {
				const mentionId = message.data?.mentionId;
				const category = message.data?.category;
				if (
					typeof mentionId === "string" &&
					mentionId.length > 0 &&
					typeof category === "string" &&
					category.length > 0
				) {
					categoryUpdates.set(mentionId, category);
				}
			}
		}

		if (categoryUpdates.size > 0) {
			setRows((current) =>
				applyMentionCategoryUpdates(current, categoryUpdates),
			);
		}

		if (hasCreatedMentions && mentionCreatedFlushTimer.current === null) {
			mentionCreatedFlushTimer.current = window.setTimeout(() => {
				void flushMentionCreatedQueue();
			}, 250);
		}
	}, [subscription.freshData, flushMentionCreatedQueue]);

	useEffect(() => {
		return () => {
			if (mentionCreatedFlushTimer.current !== null) {
				window.clearTimeout(mentionCreatedFlushTimer.current);
				mentionCreatedFlushTimer.current = null;
			}

			for (const timer of mentionHighlightTimers.current.values()) {
				window.clearTimeout(timer);
			}
			mentionHighlightTimers.current.clear();
		};
	}, []);

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

				<ActivityTicker
					activity={activity}
					freshData={subscription.freshData}
					subscriptionState={subscription.state}
					tokenError={tokenError}
				/>

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
								<Mention
									key={row.id}
									data={toMentionData(row)}
									className={
										freshMentionIds.has(row.id) ? "mention-arrive" : undefined
									}
								/>
							))}
						</div>
					)}
				</Panel>
			</div>
		</Shell>
	);
}
