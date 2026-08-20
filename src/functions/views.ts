import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "#/db/client";
import { keywords, views } from "#/db/schema";

/**
 * VIEW SERVER FUNCTIONS
 * -----------------------------------------------------------------------------
 * Views are saved reading lenses: a name plus a list of keyword ids. Deleting
 * a keyword can strand its id inside a view, so every read resolves keywordIds
 * against the keywords table and silently drops the unknowns — there is no
 * pruning on the write path.
 */

type ViewInput = { name: string; keywordIds: string[] };

function validateViewInput(data: unknown): ViewInput {
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected a view object");
	}
	const { name, keywordIds } = data as Record<string, unknown>;

	if (typeof name !== "string" || name.trim().length === 0) {
		throw new Error("A view name is required");
	}
	if (!Array.isArray(keywordIds)) {
		throw new Error("Expected keywordIds to be an array");
	}

	const ids = [
		...new Set(
			keywordIds.filter(
				(id): id is string => typeof id === "string" && id.trim().length > 0,
			),
		),
	];

	return { name: name.trim(), keywordIds: ids };
}

const memberSelect = {
	id: keywords.id,
	term: keywords.term,
	tag: keywords.tag,
};

type Member = { id: string; term: string; tag: string };

function resolveMembers(keywordIds: string[], byId: Map<string, Member>) {
	return keywordIds.map((id) => byId.get(id)).filter((k) => k !== undefined);
}

export const listViews = createServerFn().handler(async () => {
	const [rows, members] = await Promise.all([
		db.select().from(views).orderBy(desc(views.createdAt)),
		db.select(memberSelect).from(keywords),
	]);
	const byId = new Map(members.map((k) => [k.id, k]));

	return rows.map((view) => ({
		...view,
		keywords: resolveMembers(view.keywordIds, byId),
	}));
});

export const getView = createServerFn({ method: "POST" })
	.validator((data: { id: string }) => {
		if (typeof data?.id !== "string") throw new Error("Expected { id }");
		return { id: data.id };
	})
	.handler(async ({ data }) => {
		const [view] = await db.select().from(views).where(eq(views.id, data.id));
		if (!view) return null;

		const members =
			view.keywordIds.length === 0
				? []
				: await db
						.select(memberSelect)
						.from(keywords)
						.where(inArray(keywords.id, view.keywordIds));
		const byId = new Map(members.map((k) => [k.id, k]));

		return { ...view, keywords: resolveMembers(view.keywordIds, byId) };
	});

export const createView = createServerFn({ method: "POST" })
	.validator(validateViewInput)
	.handler(async ({ data }) => {
		const [created] = await db.insert(views).values(data).returning();
		return created;
	});

export const updateView = createServerFn({ method: "POST" })
	.validator((data: unknown) => {
		const { id } = data as Record<string, unknown>;
		if (typeof id !== "string" || id.length === 0) {
			throw new Error("A view id is required");
		}
		return { id, ...validateViewInput(data) };
	})
	.handler(async ({ data }) => {
		const { id, ...values } = data;
		const [updated] = await db
			.update(views)
			.set(values)
			.where(eq(views.id, id))
			.returning();
		return updated ?? null;
	});

export const deleteView = createServerFn({ method: "POST" })
	.validator((data: { id: string }) => {
		if (typeof data?.id !== "string") throw new Error("Expected { id }");
		return { id: data.id };
	})
	.handler(async ({ data }) => {
		await db.delete(views).where(eq(views.id, data.id));
		return { deleted: true };
	});

export type ViewWithKeywords = Awaited<ReturnType<typeof listViews>>[number];
