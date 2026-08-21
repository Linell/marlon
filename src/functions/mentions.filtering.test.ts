import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Mentions with `disposition = "not_a_match"` (LLM-rejected keyword hits)
 * must never reach feeds or the timeseries chart. This suite seeds a
 * throwaway libsql file DB with one rejected and one accepted mention and
 * exercises every read path in src/functions/mentions.ts.
 *
 * Calling those exports directly doesn't work in plain vitest — investigated
 * exhaustively, including empirically, not just by reading source:
 *
 * 1. Plain call, no compiler. `listMentions` etc. are
 *    `createServerFn().handler(fn)` with a *single* argument. TanStack
 *    Start's Vite/Nitro plugin normally rewrites `.handler(fn)` into
 *    `.handler(clientStub, fn)` at build time, splitting a client-callable
 *    RPC stub from the real implementation. Without that build step (a bare
 *    `vitest run` never invokes it), `.handler`'s destructured
 *    `[extractedFn, serverFn]` leaves `serverFn` `undefined`. Every
 *    invocation path — the default exported callable and its
 *    `__executeServer` — ends up discarding or never producing a return
 *    value: confirmed empirically by calling both against a trivial
 *    `createServerFn().handler(async () => [1,2,3])` and observing
 *    `undefined` results, even after resolving the separate
 *    `AsyncLocalStorage`-context error via `runWithStartContext`.
 *
 * 2. Real compiler, no server. Adding `@tanstack/react-start/plugin/vite`'s
 *    `tanstackStart()` to `vitest.config.ts` does force the real transform
 *    (confirmed via a probe: the client stub switches to `createSsrRpc`,
 *    proving the split happens). It still fails: the compiled stub resolves
 *    the real handler through `getServerFnById`, which reads a virtual
 *    module populated only by Nitro's build manifest. Outside a real
 *    dev/prod server that module is a no-op stub, so the call throws
 *    `"(intermediate value) is not a function"`. Not used — it would also
 *    make every unrelated unit test pay for a full Nitro/server-fn build.
 *
 * The fix used here: `vi.mock` the *library* dependency
 * (`@tanstack/react-start`), not app source. `src/functions/mentions.ts`
 * only ever touches `createServerFn` through the public `.validator()` /
 * `.handler()` chain, so a tiny stand-in that runs the real validator and
 * then calls the real handler with `{ data }` reproduces the framework's
 * documented contract without needing its RPC/build machinery — and without
 * re-deriving the query logic under test (mentionsQuery, notRejected,
 * dedupeByItem, the timeseries SQL all still run for real, unmodified).
 */

vi.mock("@tanstack/react-start", () => {
	type Validator = (data: unknown) => unknown;
	type Handler = (opts: { data: unknown }) => unknown;

	function createServerFn(_options?: { method?: string }) {
		let validate: Validator | undefined;
		const builder = {
			validator(fn: Validator) {
				validate = fn;
				return builder;
			},
			handler(fn: Handler) {
				return async (opts?: { data?: unknown }) => {
					const data = validate ? validate(opts?.data) : opts?.data;
					return fn({ data });
				};
			},
		};
		return builder;
	}

	return { createServerFn };
});

const dir = mkdtempSync(join(tmpdir(), "marlon-test-"));
const dbPath = join(dir, "marlon-test.db");
process.env.DATABASE_URL = `file:${dbPath}`;

let db: typeof import("#/db/client")["db"];
let schema: typeof import("#/db/schema");
let mentionsFns: typeof import("#/functions/mentions");

let keptId: string;
let rejectedId: string;
let keywordId: string;

beforeAll(async () => {
	const { migrate } = await import("drizzle-orm/libsql/migrator");
	({ db } = await import("#/db/client"));
	schema = await import("#/db/schema");
	mentionsFns = await import("#/functions/mentions");

	await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });

	const [keyword] = await db
		.insert(schema.keywords)
		.values({ term: "Widget", tag: "topic" })
		.returning();
	if (!keyword) throw new Error("keyword insert failed");

	const now = new Date();
	const [keptItem] = await db
		.insert(schema.items)
		.values({
			source: "hackernews",
			sourceId: "kept-1",
			type: "story",
			title: "A real widget question",
			bodyText: "Does anyone know how widgets work?",
			permalink: "https://example.com/kept",
			postedAt: now,
			raw: {},
		})
		.returning();
	const [rejectedItem] = await db
		.insert(schema.items)
		.values({
			source: "hackernews",
			sourceId: "rejected-1",
			type: "story",
			title: "Mercury the planet",
			bodyText: "Not about the widget at all.",
			permalink: "https://example.com/rejected",
			postedAt: now,
			raw: {},
		})
		.returning();
	if (!keptItem || !rejectedItem) throw new Error("item insert failed");

	const [kept] = await db
		.insert(schema.mentions)
		.values({
			itemId: keptItem.id,
			keywordId: keyword.id,
			category: "question",
			disposition: null,
		})
		.returning();
	const [rejected] = await db
		.insert(schema.mentions)
		.values({
			itemId: rejectedItem.id,
			keywordId: keyword.id,
			category: "uncategorized",
			disposition: "not_a_match",
		})
		.returning();
	if (!kept || !rejected) throw new Error("mention insert failed");

	keptId = kept.id;
	rejectedId = rejected.id;
	keywordId = keyword.id;
});

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
	expect(existsSync(dbPath)).toBe(false);
});

describe("mention feeds and timeseries filter rejected mentions", () => {
	it("listMentions excludes not_a_match rows", async () => {
		const rows = await mentionsFns.listMentions();
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(keptId);
		expect(ids).not.toContain(rejectedId);
	});

	it("listMentionsByIds excludes not_a_match rows even when requested", async () => {
		const rows = await mentionsFns.listMentionsByIds({
			data: { ids: [keptId, rejectedId] },
		});
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(keptId);
		expect(ids).not.toContain(rejectedId);
	});

	it("listMentionsForKeywords excludes not_a_match rows", async () => {
		const rows = await mentionsFns.listMentionsForKeywords({
			data: { keywordIds: [keywordId] },
		});
		const ids = rows.map((r) => r.id);
		expect(ids).toContain(keptId);
		expect(ids).not.toContain(rejectedId);
	});

	it("getMentionTimeseries counts only the accepted mention", async () => {
		const result = await mentionsFns.getMentionTimeseries({
			data: { keywordIds: [keywordId] },
		});
		const totalCount = result.total.reduce((a, b) => a + b, 0);
		expect(totalCount).toBe(1);

		const series = result.series.find((s) => s.keywordId === keywordId);
		expect(series).toBeDefined();
		const seriesCount = series?.counts.reduce((a, b) => a + b, 0) ?? 0;
		expect(seriesCount).toBe(1);
	});
});
