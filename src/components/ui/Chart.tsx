import { useState } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { cx } from "./cx";

/**
 * CHARTS — mention volume over a fixed 30-day window.
 *
 * Every visual element is styled from repo tokens via var(--...); Recharts'
 * default look never ships. Two components:
 *  - Sparkline: a bare trace for cards and rows. No axes, no tooltip. Renders
 *    nothing when the window is empty — a flat line would be a lie about data
 *    that isn't there.
 *  - ComparisonChart: one line per keyword plus a dashed, heavier total line
 *    (distinct items, not a sum). Static mono legend below; hovering an entry
 *    emphasizes that series.
 *
 * The dev DB is nearly empty, so sparse data is the common case: the y-domain
 * floor keeps a single mention from rendering as a cliff.
 */

const SERIES_TOKENS = [
	"var(--chart-series-1)",
	"var(--chart-series-2)",
	"var(--chart-series-3)",
	"var(--chart-series-4)",
	"var(--chart-series-5)",
	"var(--chart-series-6)",
];

function seriesColor(index: number): string {
	return SERIES_TOKENS[index % SERIES_TOKENS.length];
}

const TOTAL_STROKE = "var(--text-loud)";
const Y_FLOOR = 3;
const Y_DOMAIN: [number, (dataMax: number) => number] = [
	0,
	(dataMax) => Math.max(dataMax, Y_FLOOR),
];

const TICK_STYLE = {
	fill: "var(--text-faint)",
	fontFamily: "var(--font-mono)",
	fontSize: 11,
};

const SHORT_DATE = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

function shortDate(day: string): string {
	return SHORT_DATE.format(new Date(`${day}T00:00:00Z`));
}

export function Sparkline({
	counts,
	stroke = "var(--text-muted)",
	width = 112,
	height = 28,
}: {
	counts: number[];
	stroke?: string;
	width?: number;
	height?: number;
}) {
	if (counts.every((count) => count === 0)) return null;

	const data = counts.map((count, i) => ({ i, count }));
	return (
		<LineChart
			width={width}
			height={height}
			data={data}
			margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
		>
			<YAxis hide domain={Y_DOMAIN} />
			<Line
				dataKey="count"
				type="monotone"
				dot={false}
				stroke={stroke}
				strokeWidth={1.5}
				isAnimationActive={false}
			/>
		</LineChart>
	);
}

export type ChartSeries = { keywordId: string; term: string; counts: number[] };

export function ComparisonChart({
	dates,
	series,
	total,
}: {
	dates: string[];
	series: ChartSeries[];
	total: number[];
}) {
	const [focused, setFocused] = useState<string | null>(null);

	const data = dates.map((date, i) => ({
		date,
		total: total[i],
		...Object.fromEntries(series.map((s) => [s.keywordId, s.counts[i]])),
	}));
	const ticks = [
		dates[0],
		dates[Math.floor(dates.length / 2)],
		dates[dates.length - 1],
	];
	const opacity = (id: string) =>
		focused === null || focused === id ? 1 : 0.2;

	return (
		<div>
			<ResponsiveContainer width="100%" height={240}>
				<LineChart
					data={data}
					margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
				>
					<CartesianGrid vertical={false} stroke="var(--rule-faint)" />
					<XAxis
						dataKey="date"
						ticks={ticks}
						tickFormatter={shortDate}
						tick={TICK_STYLE}
						tickLine={false}
						axisLine={{ stroke: "var(--rule-faint)" }}
					/>
					<YAxis
						domain={Y_DOMAIN}
						tickCount={3}
						allowDecimals={false}
						tick={TICK_STYLE}
						tickLine={false}
						axisLine={false}
					/>
					<Tooltip
						content={<ChartTooltip />}
						cursor={{ stroke: "var(--rule)", strokeWidth: 1 }}
					/>
					{series.map((s, i) => (
						<Line
							key={s.keywordId}
							dataKey={s.keywordId}
							name={s.term}
							type="monotone"
							dot={false}
							stroke={seriesColor(i)}
							strokeWidth={1.5}
							strokeOpacity={opacity(s.keywordId)}
							isAnimationActive={false}
						/>
					))}
					<Line
						dataKey="total"
						name="total"
						type="monotone"
						dot={false}
						stroke={TOTAL_STROKE}
						strokeWidth={2}
						strokeDasharray="5 3"
						strokeOpacity={opacity("total")}
						isAnimationActive={false}
					/>
				</LineChart>
			</ResponsiveContainer>

			<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2">
				{series.map((s, i) => (
					<LegendEntry
						key={s.keywordId}
						label={s.term}
						color={seriesColor(i)}
						dimmed={focused !== null && focused !== s.keywordId}
						onEnter={() => setFocused(s.keywordId)}
						onLeave={() => setFocused(null)}
					/>
				))}
				<LegendEntry
					label="total"
					color={TOTAL_STROKE}
					dashed
					dimmed={focused !== null && focused !== "total"}
					onEnter={() => setFocused("total")}
					onLeave={() => setFocused(null)}
				/>
			</div>
		</div>
	);
}

function LegendEntry({
	label,
	color,
	dashed = false,
	dimmed,
	onEnter,
	onLeave,
}: {
	label: string;
	color: string;
	dashed?: boolean;
	dimmed: boolean;
	onEnter: () => void;
	onLeave: () => void;
}) {
	return (
		<button
			type="button"
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
			onFocus={onEnter}
			onBlur={onLeave}
			className={cx(
				"meta flex cursor-default items-center gap-1.5 transition-opacity",
				dimmed && "opacity-40",
			)}
		>
			<span
				aria-hidden
				className={cx("w-3.5 border-t-2", dashed && "border-dashed")}
				style={{ borderColor: color }}
			/>
			{label}
		</button>
	);
}

type TooltipEntry = {
	dataKey?: string | number;
	name?: string | number;
	value?: number | string;
	color?: string;
};

function ChartTooltip({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: TooltipEntry[];
	label?: string;
}) {
	if (!active || !payload || payload.length === 0) return null;

	const rows = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
	return (
		<div className="min-w-32 rounded-card border border-rule bg-surface-overlay px-2.5 py-2 shadow-lift">
			<div className="meta text-faint">{label ? shortDate(label) : null}</div>
			<div className="mt-1 space-y-0.5">
				{rows.map((row) => (
					<div
						key={String(row.dataKey)}
						className="meta flex items-center gap-2"
					>
						<span
							aria-hidden
							className="size-1.5 rounded-full"
							style={{ backgroundColor: row.color }}
						/>
						<span className="truncate">{row.name}</span>
						<span className="ml-auto pl-3 text-loud">{row.value}</span>
					</div>
				))}
			</div>
		</div>
	);
}
