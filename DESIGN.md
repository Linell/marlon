# Marlon — Design System

The theme is **The Wire Room**: a dark, warm-black newsroom surface with
paper-white text, a single amber signal color, and monospace for every machine
fact. Marlon is a feed of things strangers said about you, so the design's whole
job is to make *their words* the loudest thing on screen and push everything
else — source, time, score, category — into quiet mono metadata.

Primary audience is the marketing team, so it reads like a wire service desk,
not a developer console.

## The three rules

1. **Amber means live, actionable, or ours.** Nothing else is amber. A static
   heading is not amber. At most one amber button per view — two primaries mean
   neither is primary.
2. **Sans for words humans wrote. Mono for facts machines know.** Post bodies,
   headlines, and prose are Atkinson Hyperlegible Next. Handles, timestamps,
   IDs, counts, keyword strings, and match operators are Atkinson Hyperlegible
   Mono. If you can't tell which a thing is, ask whether a person typed it.
3. **Components read roles, never ramps.** A component may use
   `text-muted` or `text-source-hackernews`. It may never use `--ink-300` or a
   raw hex. This is what keeps re-theming to a single file.

## Architecture

Three files, in strict dependency order:

| File | Holds | You edit it when |
| --- | --- | --- |
| `src/styles/tokens.css` | Layer 1 ramps (`--ink-*`, `--amber-*`) and Layer 2 roles (`--surface`, `--tag-competitor`) | Adding or recoloring a token |
| `src/styles/theme.css` | Maps roles into Tailwind utilities via `@theme inline`; base element styles; custom utilities | Exposing a new token to Tailwind |
| `src/components/ui/registry.ts` | Maps each domain enum (source, tag, category) to its label, code, and classes | Adding a platform, tag, or category |

`src/styles.css` is just the entry point that imports Tailwind, the fonts, and
the two stylesheets in order.

### Routes

- `/` is the front door and is deliberately near-empty. **Keep it honest** — no
  invented metrics, no placeholder feeds. Empty states are the correct thing to
  show when there is nothing yet.
- `/style` is the style reference and the only place sample data belongs. It
  renders every registry by mapping over it, so a new token surfaces there
  automatically instead of going quietly unused. Delete it wholesale if you'd
  rather not carry it.

### Why `@theme inline` and not `@theme`

`@theme inline` emits utilities whose values are `var(--role)` rather than a
baked-in hex:

```css
.text-source-hackernews { color: var(--source-hackernews) }   /* inline  ✅ */
.text-source-hackernews { color: #f26522 }                    /* plain   ❌ */
```

Because the value stays a variable, any selector can repoint it at runtime.
That is the entire mechanism behind the day/night toggle, and it is how a future
"high contrast" or per-workspace theme will work too. **If you switch this to
plain `@theme`, runtime theming silently dies.** Verify with:

```bash
npm run build && grep -o "\.text-loud{[^}]*}" .output/public/assets/*.css
# want: .text-loud{color:var(--text-loud)}
```

### Layer 1 vs. Layer 2

Layer 1 is named for what a color *is* (`--ink-900`, `--rust-400`). Layer 2 is
named for what it *does* (`--surface-raised`, `--tag-competitor`). Only Layer 2
is exposed to Tailwind, so a component physically cannot reach a ramp.

The payoff: `[data-theme="day"]` in `tokens.css` reskins the entire app by
repointing ~20 role variables. No component changed, no ramp changed, no
rebuild.

## Recipes

### Add a platform (the common one)

Three mechanical edits, each one line:

```css
/* 1. tokens.css — under "Sources" */
--source-bluesky: #3b8ef0;
```
```css
/* 2. theme.css — under "Color: domain" */
--color-source-bluesky: var(--source-bluesky);
```
```ts
/* 3. registry.ts — add to SOURCES */
bluesky: {
  label: "Bluesky",
  code: "BSKY",
  chip: "text-source-bluesky border-source-bluesky/35 bg-source-bluesky/10",
  fg: "text-source-bluesky",
},
```

Nothing else. `<SourceChip source="bluesky" />` works, and the Sources section
of the landing page picks it up automatically because it maps over `SOURCES`.

Pick a hue that survives on a warm-black ground — true brand colors often need
nudging warmer or lighter. Keep it clearly distinct from amber.

### Add a category or keyword tag

Same three steps, using `CATEGORIES` / `TAGS` and the matching token block. Only
`question` gets a cool attention-pulling hue, because it's the category the team
actually acts on; keep new categories quieter than that unless they're also
actionable.

### Add a new theme

Copy the `[data-theme="day"]` block in `tokens.css`, rename the selector, and
override only the roles you want changed. Never touch ramps or components.

## Conventions worth not relitigating

- **Class strings are literal, never interpolated.** Tailwind only emits
  utilities it can find as literal text, so
  `` `text-source-${key}` `` compiles to nothing. That's why `registry.ts`
  spells every class out in full.
- **Threading uses hairlines, not nested cards.** One `--thread-rung` of
  padding plus one vertical rule per depth level. Nested cards turn to mush by
  depth three, and HN threads go deeper than that.
- **Sentiment is a 2px left edge, never a badge.** It's a hint the team mostly
  ignores; it should cost zero attention until wanted. Don't promote it without
  a real request.
- **Exclusions get triple encoding** — a `−` glyph, a rust hue, *and*
  strikethrough. `Temporal` vs. `temporal lobe` is the subtlest idea in the
  product and color alone fails for red/green color deficiency.
- **Deltas are muted, not traffic lights.** "Mentions up 18%" is not inherently
  good or bad news, so don't paint it green.
- **Route wrappers are `flex min-h-dvh flex-col` with a `flex-1` main.** This
  pins the footer to the bottom on short pages; a bare `min-h-dvh` wrapper
  leaves dead space below the footer instead.
- **Empty is a first-class state.** Marlon starts with nothing in it and will
  have quiet stretches after that. Reach for `EmptyState` rather than seeding a
  panel with placeholder rows.
- **There is no live/status/pipeline-health vocabulary, on purpose.** An earlier
  draft had one and it was removed as noise the team doesn't need. Don't
  reintroduce "LIVE" badges or pulsing dots without a real requirement.
- **Radii stay small** (`slot` 2px, `card` 4px, `panel` 6px). A wire room is
  built from rules and boxes. No pills.
- **Numbers are `tabular-nums`** everywhere, so live-updating counts don't
  jitter.

## The ledger grid

The grid is the strongest bit of character in the theme and carries most of the
visual weight while the app is still empty. It is **the app's default ground**:
rendered once in `__root.tsx` as `<div className="grid-ground" aria-hidden />`,
so every route inherits it and no page opts in.

Two tiers, like real graph paper — a minor line every `--grid-size` and a
stronger major line every fourth:

```css
--grid-line:       var(--ink-700);  --grid-line-major: var(--ink-600);  /* night */
--grid-line:       var(--ink-100);  --grid-line-major: var(--ink-150);  /* day   */
--grid-size:       32px;            --grid-size-major: 128px;
```

The layered `background-image` is composed once into `--grid-image` /
`--grid-image-size`, so `grid-ground` and the `rule-grid` utility can never
drift apart. Major layers are listed first because the first background layer
paints on top.

### The transparency contract

`grid-ground` is `position: fixed` with `z-index: -1`, which puts it above
`<body>`'s background color but behind all content. Two consequences worth
knowing before you debug a missing grid:

- **Page wrappers must stay transparent.** A full-page `bg-surface` wrapper
  paints straight over the grid. This is why the route wrappers are just
  `flex min-h-dvh flex-col text-body`.
- **Anything that should read as a solid object on top of the paper sets its own
  opaque background** — the header, the footer, every `Panel`. The grid stopping
  at an object's edge is what makes it read as an object.

It's fixed rather than scrolling so the fade stays anchored to the top of the
viewport; a long page never becomes an uninterrupted wall of grid. The mask is
`radial-gradient(ellipse at top, black, transparent 80%)` — it must dissolve
rather than stop at a hard edge.

Use the `rule-grid` utility only to re-apply the grid *on top of* an opaque
surface — a panel meant to read as bare paper. The page never needs it.

### The two themes are matched by eye, not by number

Night runs a much wider lightness gap against its surface than day does — about
ΔL\* 14 versus ΔL\* 5 — and that asymmetry is deliberate. Perceptual
sensitivity to lightness collapses near black, so giving night the same
*measured* delta as day makes the grid disappear. Matching the numbers would
break the match that matters.

What *is* held constant across themes is the **major/minor ratio** (~1.5), which
is what makes both read as the same paper. Day needed the `--ink-150` stop to
hit it; `ink-200` was more than twice too strong.

If you want to retune, these are the ramp stops against the night surface
(`--ink-950`, L\* 4.0):

| stop | L\* | ΔL\* | reads as |
| --- | --- | --- | --- |
| `ink-850` | 9.5 | 5.5 | numerically matches day; effectively invisible |
| `ink-800` | 12.6 | 8.6 | present but easy to miss |
| `ink-700` | 17.9 | 13.9 | **current minor** — soft but unmistakable |
| `ink-600` | 25.3 | 21.3 | **current major** |

## Custom utilities

Three high-traffic patterns are promoted to real utilities in `theme.css` so
they stay consistent instead of being re-improvised:

- `meta` — the house style for machine facts: mono, 12px, muted, tabular.
- `label-caps` — section eyebrows and column headers; mono, 11px, wide tracking.
- `rule-grid` — the faint 32px ledger grid used behind the hero.

## Icons

`src/components/ui/icons.tsx` holds inline SVGs — no icon dependency. House
rules so a growing set stays coherent:

- 24×24 viewBox, 1.5 stroke, round caps and joins, `fill="none"`.
- Stroke is `currentColor`, so an icon inherits the text color it sits in and
  never needs a token of its own.
- Sized by the caller (`size-4`, `size-5`), never hardcoded on the `<svg>`.
- Always `aria-hidden="true"` **written on the element**, not passed through a
  spread — linters can't see it through a spread, and the accessible name
  belongs on the button anyway.

Icon-only buttons use `<Button size="icon">`, which is square and matched to
`sm` height so it lines up in a toolbar.

For a mode toggle, show the mode the user will *get* (a sun means "click for
day") and put the same thing in words in `aria-label`. An icon alone is
ambiguous whichever way you read it.

## Fonts

Both faces are self-hosted variable fonts (weights 200–800) via
`@fontsource-variable/*`, so there's no external request and no FOUT beyond the
`swap`. Atkinson Hyperlegible was designed for low-vision readability — high
character distinction, large x-height — which is also just good for a dense
feed. Body line-height is 1.6 to compensate for that x-height.

## Accessibility notes already handled

- Focus rings are amber at 2px with offset, globally, via `:focus-visible`.
- `prefers-reduced-motion` kills animation globally (the `!important` there is
  load-bearing — it has to beat utility and inline styles).
- `color-scheme` is declared per theme so form controls and scrollbars match.
- Exclusions and status chips never rely on color alone.

## What is deliberately not here

No component library, no variant engine, no dark/light class strategy beyond
the data attribute. `cx.ts` is four lines; swap it for `clsx` +
`tailwind-merge` when variants actually get hairy, not before.
