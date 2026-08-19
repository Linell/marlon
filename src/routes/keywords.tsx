import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Shell } from "#/components/Shell";
import { Button } from "#/components/ui/Button";
import { cx } from "#/components/ui/cx";
import { EmptyState } from "#/components/ui/EmptyState";
import { KeywordRule } from "#/components/ui/KeywordRule";
import { Panel, PanelHeader } from "#/components/ui/Panel";
import { TAGS, type Tag } from "#/components/ui/registry";
import type { Keyword } from "#/db/schema";
import {
	createKeyword,
	deleteKeyword,
	listKeywords,
	setKeywordActive,
} from "#/functions/keywords";

export const Route = createFileRoute("/keywords")({
	loader: () => listKeywords(),
	component: KeywordsPage,
});

function KeywordsPage() {
	const rows = Route.useLoaderData();

	return (
		<Shell>
			<div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
				<h1 className="text-2xl font-extrabold tracking-tight text-loud">
					Keywords
				</h1>
				<p className="mt-2 max-w-xl text-muted">
					The words Marlon watches for, and the co-mention rules that keep the
					noise out.
				</p>

				<CreateKeywordPanel />

				<Panel className="mt-8 overflow-hidden">
					<PanelHeader
						title="Tracked Keywords"
						aside={
							<span className="meta text-faint tabular-nums">
								{rows.length} tracked
							</span>
						}
					/>
					{rows.length === 0 ? (
						<EmptyState
							title="Nothing tracked yet"
							body="Add a keyword above and every source import starts matching against it."
						/>
					) : (
						<ul className="divide-y divide-rule-faint">
							{rows.map((row) => (
								<KeywordRow key={row.id} row={row} />
							))}
						</ul>
					)}
				</Panel>
			</div>
		</Shell>
	);
}

function KeywordRow({ row }: { row: Keyword }) {
	const router = useRouter();
	const setActiveFn = useServerFn(setKeywordActive);
	const deleteFn = useServerFn(deleteKeyword);
	const [busy, setBusy] = useState(false);

	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		try {
			await action();
			await router.invalidate({ sync: true });
		} finally {
			setBusy(false);
		}
	};

	return (
		<li className={cx("flex items-center", !row.active && "opacity-45")}>
			<KeywordRule
				className="min-w-0 flex-1"
				keyword={row.term}
				tag={row.tag as Tag}
				include={row.include}
				exclude={row.exclude}
			/>
			<span className="flex shrink-0 items-center gap-1 pr-3">
				<Button
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() =>
						run(() =>
							setActiveFn({ data: { id: row.id, active: !row.active } }),
						)
					}
				>
					{row.active ? "Pause" : "Resume"}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => run(() => deleteFn({ data: { id: row.id } }))}
				>
					Remove
				</Button>
			</span>
		</li>
	);
}

/* --- Create form ----------------------------------------------------------- */

const EMPTY_FORM = { term: "", tag: "own" as Tag, include: "", exclude: "" };

/** "planet, retrograde" → ["planet", "retrograde"] */
function splitTerms(value: string): string[] {
	return value
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
}

function CreateKeywordPanel() {
	const router = useRouter();
	const createFn = useServerFn(createKeyword);
	const [form, setForm] = useState(EMPTY_FORM);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.term.trim() || busy) return;
		setBusy(true);
		setError(null);
		try {
			await createFn({
				data: {
					term: form.term,
					tag: form.tag,
					include: splitTerms(form.include),
					exclude: splitTerms(form.exclude),
				},
			});
			setForm(EMPTY_FORM);
			await router.invalidate({ sync: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel className="mt-10 overflow-hidden">
			<PanelHeader title="Track a Keyword" />
			<form onSubmit={submit} className="grid gap-4 px-4 py-4 sm:grid-cols-2">
				<Field label="Keyword" hint="the term to match">
					<input
						className={INPUT}
						value={form.term}
						onChange={(e) => setForm({ ...form, term: e.target.value })}
						placeholder="Mercury"
						required
					/>
				</Field>

				<Field label="Tag" hint="why we watch it">
					<select
						className={INPUT}
						value={form.tag}
						onChange={(e) => setForm({ ...form, tag: e.target.value as Tag })}
					>
						{Object.entries(TAGS).map(([key, entry]) => (
							<option key={key} value={key}>
								{entry.label}
							</option>
						))}
					</select>
				</Field>

				<Field label="+ Also Requires" hint="comma-separated, optional">
					<input
						className={INPUT}
						value={form.include}
						onChange={(e) => setForm({ ...form, include: e.target.value })}
						placeholder="planet, retrograde"
					/>
				</Field>

				<Field label="− Rejects" hint="kills the match if present">
					<input
						className={INPUT}
						value={form.exclude}
						onChange={(e) => setForm({ ...form, exclude: e.target.value })}
						placeholder="car, dealership"
					/>
				</Field>

				<div className="flex items-center gap-3 sm:col-span-2">
					<Button type="submit" variant="signal" size="md" disabled={busy}>
						Track keyword
					</Button>
					{error && (
						<span className="font-mono text-[0.75rem] text-match-exclude">
							{error}
						</span>
					)}
				</div>
			</form>
		</Panel>
	);
}

const INPUT = cx(
	"h-9 w-full rounded-slot border border-rule bg-surface px-2.5",
	"font-mono text-[0.8125rem] text-body placeholder:text-faint",
	"focus:border-rule-loud focus:outline-none",
);

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint: string;
	children: React.ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: the control is the child
		<label className="block">
			<span className="flex items-baseline justify-between gap-3">
				<span className="label-caps">{label}</span>
				<span className="meta text-faint">{hint}</span>
			</span>
			<span className="mt-1.5 block">{children}</span>
		</label>
	);
}
