# marlon

Self-hosted keyword-mention tracker: see what strangers are saying about you.

## What it does

Marlon watches sources (currently Hacker News and Lobsters) for tracked
keywords. An Inngest cron fans out an import per source every 15 minutes;
matched items become mentions, which are enriched and categorized (OpenAI when
`OPENAI_API_KEY` is set, rule-based fallback otherwise). A TanStack Start UI
serves the mention feed, saved views, and volume charts.

## Prerequisites

- Node 22
- pnpm
- Inngest Dev Server for background jobs locally (`pnpm dlx inngest-cli@latest dev`)
- Optional: an OpenAI API key for LLM categorization

## Setup

```sh
git clone <repo> && cd marlon
pnpm install
pnpm db:migrate   # creates the local SQLite db (file:.data/marlon.db)
```

Local env lives in `.env.local`. Set `INNGEST_DEV=1` so Inngest talks to the
local Dev Server instead of Inngest Cloud; optionally add `OPENAI_API_KEY`.
`DATABASE_URL` defaults to `file:.data/marlon.db` (libsql — point it at
`libsql://<db>.turso.io` + `DATABASE_AUTH_TOKEN` for hosted). The full env
contract is documented in `deploy/marlon.env.example`.

## Run

```sh
pnpm dev                          # app on http://localhost:3000
pnpm dlx inngest-cli@latest dev   # dev server on http://localhost:8288
```

Inngest functions are served at `/api/inngest`; the Dev Server UI shows runs,
crons, and lets you trigger imports manually.

Other scripts:

```sh
pnpm test          # vitest
pnpm check         # biome lint + format
pnpm db:generate   # new migration after editing src/db/schema.ts
pnpm db:studio
```

## Layout

- `src/routes/` — TanStack Router file routes (`/`, `/keywords`, `/views`, `/api/inngest`)
- `src/inngest/` — client, events, and functions (schedule/import/enrich/categorize)
- `src/sources/` — per-source adapters; add a source here
- `src/db/` — drizzle schema and libsql client; migrations in `drizzle/`
- `DESIGN.md` — design system; read it before touching styles or components

## Deploy

The build is a self-contained Node server:

```sh
pnpm build
node .output/server/index.mjs
```

`deploy/` has a worked single-box example (systemd + Caddy, `./deploy/deploy.sh`);
see [deploy/README.md](deploy/README.md). Other Nitro presets:
https://v3.nitro.build/deploy.
