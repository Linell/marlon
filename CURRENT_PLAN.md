# llm categorization for mentions

## Status: implemented (commit 991828a, 2026-08-21)

Everything below is built, tested (`pnpm test`, 27 tests), and migrated
(`drizzle/0006`), except Phase 2 (human corrections), which remains spec-only.

As-built notes where reality diverged from or refined the plan:

- **Shared write/publish helpers** (`src/inngest/categorization.ts`):
  `applyCategorization()` is the single home of the `category IS NULL`
  idempotency guard; `publishCategorized()` owns the activity-feed payload.
  All three write sites (enrich-mention, llm-categorize, its no-key fallback)
  funnel through them — Phase 2's correction write should too, except that
  human corrections overwrite a *non-null* category, so they need their own
  guard, not `applyCategorization`.
- **Read-side filter is structural**: `mentionsQuery(where?)` in
  `src/functions/mentions.ts` ANDs `notRejected` internally; only the
  timeseries aggregates apply it explicitly. New feed readers get it free.
- **LLM vocabulary = filter-bar vocabulary**: `ASSIGNABLE` in `src/lib/llm.ts`
  reuses `FILTERABLE_CATEGORIES` from the registry (every category except
  `uncategorized`).
- **Event id scheme**: `mention.created.llm/${mentionId}`.
- **`responseOutputText()`** extracts text structurally from the Responses API
  result because `step.ai.wrap` outputs are JSON round-tripped on replay and
  the OpenAI SDK's `output_text` convenience may not survive it.
- **Write + `step.score` run in one `Promise.all`** (independent; saves a step
  round trip per mention).
- **Throttle is a guess**: 30/min in `llmCategorize.ts` — resize to the actual
  OpenAI tier. Model `gpt-5-nano`, threshold 0.7, in `src/lib/llm.ts`.
- **Testing**: vitest was added to the repo by this work. Server functions
  aren't directly callable outside the Start build; the DB filtering suite
  mocks only `createServerFn`'s wrapper (rationale documented in
  `src/functions/mentions.filtering.test.ts`).
- **Otel preload** (`--import @inngest/otel/node`) is wired into the `dev` and
  `preview` scripts only. The production start command on the droplet must add
  the same `NODE_OPTIONS` or cost metadata silently won't appear.

Remaining release steps: deploy (no-op — flag defaults false), set
`OPENAI_API_KEY`, toggle `llmEnabled` on one ambiguous keyword, watch
`rules_agreement`/`judge_agreement` and cost in the Inngest dashboard, then
opt in the rest. Then build Phase 2 (spec at the bottom of this doc).

---

## Problem

The regex categorizer in `src/lib/categorize.ts` is inaccurate (a question mark does not make a question), and ambiguous keywords like "Mercury" produce false-positive mentions that inflate the volume charts. Running every item through an LLM costs too much.

## Solution

Keywords gain an `llmEnabled` flag. At match time `importSource` routes opted-in mentions to a new `llmCategorize` function, where one cheap OpenAI call (structured output) both confirms the match and assigns the category. The LLM is authoritative; the rules guess is computed in memory only, to score how bad the rules are. Everything else keeps today's rules path.

Three scores: `rules_agreement` (inline, every LLM run), `judge_agreement` (1-in-5 sampled second-opinion judge via `defer()`), `human_agreement` (phase 2, on human corrections). Rejected matches get `disposition = "not_a_match"` and are filtered from all feeds and charts.

## Out of scope

- Batching, OpenAI Batch API, per-item dedup (low volume).
- Reprocessing existing mentions when `llmEnabled` toggles (matches the "keyword edits never rematch" precedent).
- The rules path for non-opted-in keywords.
- Phase 2 ships separately; only its shape is specced here.

## Risks

- **Cost/rate limits**: per-keyword opt-in, `throttle`, `retries: 2`, tiny prompts, cost metadata via `@inngest/otel`.
- **libsql writer contention**: `llmCategorize` gets its own `concurrency: { limit: 2 }` pool. Up to 4 brief concurrent writes is accepted; if `SQLITE_BUSY` appears, share an account-scoped concurrency key.
- **LLM drift**: sampled judge, then human corrections. Low confidence writes `uncategorized`, never a guess.

## Release

`llmEnabled` defaults false, so deploy is a no-op. Migrate → deploy → opt in one ambiguous keyword → watch scores and cost in the Inngest dashboard → opt in the rest. Rollback: toggle the flag off.

## Implementation

### Schema (`src/db/schema.ts`, `db:generate && db:migrate`)

- `keywords.llmEnabled` boolean, not null, default false.
- `mentions.disposition` text nullable: `NULL` = match, `"not_a_match"` = LLM rejected.
- `mentions.enrichRunId` text nullable, for external scoring.
- New terminal `category` value `"uncategorized"`. `NULL` still means "not yet enriched" — every terminal state writes a non-null category, since that NULL check is the idempotency guard.

### Routing (`src/inngest/events.ts`, `importSource.ts`)

New event `mention.created.llm`, same payload and deterministic-id scheme as `mentionCreated`. `importSource` already holds the keyword row at emit time and picks the event from `llmEnabled`. Trigger `if` expressions can't do this — they only see the event payload, not DB fields. Flag is snapshotted at emit; in-flight events keep their route. `enrichMention` is untouched.

### `llmCategorize` (`src/inngest/fns/llmCategorize.ts`)

Trigger `mention.created.llm`; `concurrency: { limit: 2 }`, `throttle` sized for the OpenAI tier, `retries: 2`.

1. Load mention + item + keyword; bail if `category` is not null.
2. Compute the rules guess in memory via the existing `categorize()`. Never write it.
3. `step.ai.wrap()` OpenAI call, gpt-5-nano class, structured output `{ isMatch, category | null, confidence }`. Prompt: keyword term/aliases + title + ~200 chars around the match (reuse `match.ts` positions).
4. One write: `disposition = isMatch ? null : "not_a_match"`; `category = (isMatch && confidence ≥ threshold && llm.category) ? llm.category : "uncategorized"`; `categorizedBy = "llm"`; `enrichRunId`.
5. `step.score("rules-agreement", { name: "rules_agreement", value: rulesGuess === llm.category })`. One name — per-category breakdowns come from joining runs to mention rows (`ScoreOptions` has no dimensions).
6. If `hash(mentionId) % 5 === 0` (deterministic, replay-safe): `defer("judge-category", { function: categoryJudge, data: {...} })`. Not awaited, not in `step.run`.
7. Publish `mention.categorized` to the realtime activity topic.

No `OPENAI_API_KEY`: run rules, `categorizedBy = "rules"`, log a warning, skip steps 5–6 so rules-vs-rules never pollutes the metrics.

### `categoryJudge` (`src/inngest/fns/categoryJudge.ts`)

`createScorer()`; model call in `step.ai.wrap()` with a "is this categorization correct?" prompt; returns `{ name: "judge_agreement", value }`. `defer()` threads the parent runId. **Register it in `src/inngest/fns/index.ts`** — it fails silently otherwise.

### Client & observability

- Add `scoreMiddleware()` to `src/inngest/client.ts` (required for `step.score`, also silent if missing).
- Preload `node --import @inngest/otel/node` in run scripts. `aiMetadata: true` only reads OTel spans; without the provider, cost metadata silently never appears.
- OpenAI client, model name, and threshold in `src/lib/llm.ts`.

### Read-side filtering (`src/functions/mentions.ts`)

Exclude `disposition = "not_a_match"` in `mentionSelect`/`listMentions`, `listMentionsByIds`, `listMentionsForKeywords`, and `getMentionTimeseries`. Skip this and rejected matches keep inflating the charts the feature exists to fix.

### UI

- Add `uncategorized` to `CATEGORIES` plus a `category(key)` fallback helper mirroring `source()`, so `CategoryChip` can't crash on unknown values.
- Exclude `uncategorized` from the index filter bar (it iterates `Object.keys(CATEGORIES)`); the mentions still render with a muted chip.
- Add the `llmEnabled` toggle to `KeywordInput`, `validateKeywordInput`, `updateKeyword`, and `KeywordRow.tsx` / `routes/keywords.tsx`.

### Phase 2: human corrections

A server function to edit a mention's category (closed enum). When `categorizedBy === "llm"` and `enrichRunId` is set: `inngest.score({ name: "human_agreement", value: newCategory === oldCategory, runId: enrichRunId })`, then `categorizedBy = "human"` in the same write (score-once). A "confirm" action scores 1 through the same hook. Corrections to rules-categorized mentions don't emit it.

## Testing

- Pure functions: prompt/snippet building, LLM-result → `{category, disposition}` mapping (isMatch false, low confidence, null category), sampling hash.
- `not_a_match` mentions absent from feeds and timeseries counts.
- No API key → rules path, no scores.
- `category()` falls back on unknown keys; filter bar omits `uncategorized`.

## Alternatives

- **`llmEnabled` stamped on one shared event + inverse trigger `if`s**: keeps a single domain event for future consumers, but needs the payload change anyway and two conditions to keep in sync. One consumer per path today, so distinct events win. Revisit if an "all mentions" consumer appears.
- **LLM call inside `enrichMention`**: its concurrency-2 pool protects the libsql writer; slow OpenAI calls would starve fast rules-only writes.
- **Two chained agents (confirm, then classify)**: same context, double cost.
- **`waitForEvent` scorer for human feedback**: push-based `inngest.score()` with stored `enrichRunId` avoids idle 7-day runs, and "nobody reviewed it" is not signal here.
- **`not_a_match`/low-confidence as `category` values or NULL**: NULL breaks the not-yet-enriched invariant and re-spends LLM calls on retry; unknown keys crash `CategoryChip`. Hence `disposition` + `uncategorized`.

## References

Inngest docs (`../website/pages/docs/`): `examples/ai-eval-scorer-quickstart.mdx`, `examples/ai-metadata-quickstart.mdx`, `features/inngest-functions/steps-workflows/deferred-scoring.mdx`, `reference/typescript/v4/functions/scoring.mdx`, `guides/throttling.mdx`, `../shared/Patterns/_patterns/score-agents-on-real-outcomes.mdx`. Verified against inngest@4.18.1 typings by two independent design reviews.
