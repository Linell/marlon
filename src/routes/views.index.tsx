import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Shell } from "#/components/Shell";
import { Button } from "#/components/ui/Button";
import { TagChip } from "#/components/ui/Chip";
import { cx } from "#/components/ui/cx";
import { EmptyState } from "#/components/ui/EmptyState";
import { Panel, PanelHeader } from "#/components/ui/Panel";
import type { Tag } from "#/components/ui/registry";
import { ViewCard } from "#/components/ViewCard";
import type { Keyword } from "#/db/schema";
import { listKeywords } from "#/functions/keywords";
import { getMentionTimeseries } from "#/functions/mentions";
import {
	createView,
	deleteView,
	listViews,
	updateView,
	type ViewWithKeywords,
} from "#/functions/views";

export const Route = createFileRoute("/views/")({
	loader: async () => {
		const [viewRows, keywords] = await Promise.all([
			listViews(),
			listKeywords(),
		]);
		const stats = await Promise.all(
			viewRows.map((view) =>
				getMentionTimeseries({
					data: { keywordIds: view.keywords.map((k) => k.id) },
				}),
			),
		);
		const views = viewRows.map((view, i) => ({
			...view,
			spark: stats[i].total,
			mentionCount: stats[i].total.reduce((sum, n) => sum + n, 0),
		}));
		return { views, keywords };
	},
	component: ViewsPage,
});

function ViewsPage() {
	const { views, keywords } = Route.useLoaderData();

	return (
		<Shell>
			<div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
				<h1 className="text-2xl font-extrabold tracking-tight text-loud">
					Views
				</h1>
				<p className="mt-2 max-w-xl text-muted">
					Named groupings of keywords — saved lenses over everything Marlon has
					already stored.
				</p>

				<CreateViewPanel keywords={keywords} />

				{views.length === 0 ? (
					<Panel className="mt-8 overflow-hidden">
						<EmptyState
							title="No views yet"
							body="Group a few keywords above to read their mentions as one feed."
						/>
					</Panel>
				) : (
					<div className="mt-8 grid gap-4 sm:grid-cols-2">
						{views.map((view) => (
							<ViewPanel key={view.id} view={view} keywords={keywords} />
						))}
					</div>
				)}
			</div>
		</Shell>
	);
}

function ViewPanel({
	view,
	keywords,
}: {
	view: ViewWithKeywords & { spark: number[]; mentionCount: number };
	keywords: Keyword[];
}) {
	const router = useRouter();
	const updateFn = useServerFn(updateView);
	const deleteFn = useServerFn(deleteView);
	const [editing, setEditing] = useState(false);
	const [busy, setBusy] = useState(false);

	if (editing) {
		return (
			<Panel className="px-4 py-4 sm:col-span-2">
				<ViewForm
					keywords={keywords}
					initial={{ name: view.name, keywordIds: view.keywordIds }}
					submitLabel="Save changes"
					onCancel={() => setEditing(false)}
					onSubmit={async (values) => {
						await updateFn({ data: { id: view.id, ...values } });
						await router.invalidate({ sync: true });
						setEditing(false);
					}}
				/>
			</Panel>
		);
	}

	return (
		<ViewCard
			view={view}
			actions={
				<span className="flex shrink-0 items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={() => setEditing(true)}
					>
						Edit
					</Button>
					<Button
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							try {
								await deleteFn({ data: { id: view.id } });
								await router.invalidate({ sync: true });
							} finally {
								setBusy(false);
							}
						}}
					>
						Remove
					</Button>
				</span>
			}
		/>
	);
}

function CreateViewPanel({ keywords }: { keywords: Keyword[] }) {
	const router = useRouter();
	const createFn = useServerFn(createView);
	// Remounting the form after a successful create is the reset.
	const [formKey, setFormKey] = useState(0);

	return (
		<Panel className="mt-10 overflow-hidden">
			<PanelHeader title="Create a View" />
			<div className="px-4 py-4">
				<ViewForm
					key={formKey}
					keywords={keywords}
					initial={{ name: "", keywordIds: [] }}
					submitLabel="Create view"
					onSubmit={async (values) => {
						await createFn({ data: values });
						await router.invalidate({ sync: true });
						setFormKey((k) => k + 1);
					}}
				/>
			</div>
		</Panel>
	);
}

/* --- View form -----------------------------------------------------------------
   Name plus a keyword picker: a plain list of toggleable rows in KeywordRule's
   term+tag dress. Selection borrows the include (moss, "+") encoding — a
   member keyword is included in the view. */

function ViewForm({
	keywords,
	initial,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	keywords: Keyword[];
	initial: { name: string; keywordIds: string[] };
	submitLabel: string;
	onSubmit: (values: { name: string; keywordIds: string[] }) => Promise<void>;
	onCancel?: () => void;
}) {
	const [name, setName] = useState(initial.name);
	const [selected, setSelected] = useState(() => new Set(initial.keywordIds));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const toggle = (id: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || busy) return;
		setBusy(true);
		setError(null);
		try {
			await onSubmit({ name, keywordIds: [...selected] });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setBusy(false);
		}
	};

	return (
		<form onSubmit={submit} className="grid gap-4">
			<label className="block max-w-sm">
				<span className="flex items-baseline justify-between gap-3">
					<span className="label-caps">Name</span>
					<span className="meta text-faint">what this lens is for</span>
				</span>
				<input
					className={cx(
						"mt-1.5 h-9 w-full rounded-slot border border-rule bg-surface px-2.5",
						"font-mono text-[0.8125rem] text-body placeholder:text-faint",
						"focus:border-rule-loud focus:outline-none",
					)}
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Competitive set"
					required
				/>
			</label>

			<div>
				<span className="flex items-baseline justify-between gap-3">
					<span className="label-caps">Keywords</span>
					<span className="meta text-faint tabular-nums">
						{selected.size} selected
					</span>
				</span>
				{keywords.length === 0 ? (
					<p className="mt-1.5 text-[0.875rem] text-muted">
						Track a keyword first — a view is a grouping of them.
					</p>
				) : (
					<div className="mt-1.5 divide-y divide-rule-faint rounded-slot border border-rule">
						{keywords.map((keyword) => (
							<KeywordPickRow
								key={keyword.id}
								keyword={keyword}
								selected={selected.has(keyword.id)}
								onToggle={() => toggle(keyword.id)}
							/>
						))}
					</div>
				)}
			</div>

			<div className="flex items-center gap-3">
				<Button type="submit" variant="signal" size="md" disabled={busy}>
					{submitLabel}
				</Button>
				{onCancel && (
					<Button
						type="button"
						variant="ghost"
						size="md"
						disabled={busy}
						onClick={onCancel}
					>
						Cancel
					</Button>
				)}
				{error && (
					<span className="font-mono text-[0.75rem] text-match-exclude">
						{error}
					</span>
				)}
			</div>
		</form>
	);
}

function KeywordPickRow({
	keyword,
	selected,
	onToggle,
}: {
	keyword: Keyword;
	selected: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onToggle}
			className={cx(
				"flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors",
				selected ? "bg-match-include/10" : "hover:bg-surface-hover",
			)}
		>
			<span
				aria-hidden
				className={cx(
					"w-3 font-mono text-sm font-bold",
					selected ? "text-match-include" : "text-faint",
				)}
			>
				{selected ? "+" : "·"}
			</span>
			<span className="font-mono text-sm font-bold text-loud">
				{keyword.term}
			</span>
			{keyword.aliases.length > 0 && (
				<span className="min-w-0 truncate font-mono text-sm text-muted">
					<span className="text-faint">or </span>
					{keyword.aliases.join(", ")}
				</span>
			)}
			<span className="ml-auto">
				<TagChip tag={keyword.tag as Tag} form="label" />
			</span>
		</button>
	);
}
