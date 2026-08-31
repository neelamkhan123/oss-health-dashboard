# OSS Health Dashboard — Build Guide (updated 2026-08-25)

This replaces Part 9 of the original guide (frontend scaffold). **Parts
1–8 and 10–18 are unchanged** — the backend still matches Parts 1–8
exactly (models, Alembic, Celery, the naive `/stats-naive` endpoint, and
the `/overview`/`/contributors` stubs). Part 10 (baseline performance
measurement) hasn't started — that's the next real milestone once the UI
is settled, which it now is.

**Second revision note:** the first version of this guide (2026-08-24)
described a UI pass that filled in RepoDetail/Compare with reasonable but
invented placeholder content, because nobody had a way to read the actual
Claude Design prototype it was supposed to match — the published artifact
returns an auth-walled editor page to anything without a logged-in
claude.ai session, including a plain fetch. That version was thrown out
and redone: the prototype artifact turned out to be readable after all —
Claude Design prototypes bundle their real markup as gzip+base64 blobs
inside the page's own HTML, decodable offline with no auth — and a second
pass (Opus 5, given that decoded ground truth directly) rebuilt Overview,
RepoDetail and Compare against the prototype's actual structure, copy, and
mock dataset instead of guessing. If you ever need to re-derive ground
truth from a Claude Design artifact again: `action: "read"` on an
owned artifact saves its HTML; the real content is inside
`<script type="__bundler/template">` (a JSON string of the full page) and
`<script type="__bundler/manifest">` (JSON of `{uuid: {mime, compressed,
data: base64}}` — gzip-decompress `data` when `compressed` is true).

---

## PART 9.0 — Component library: done, skip this

Every component either page needs (`StatCard`, `Chart`, `DataTable`, the
`Sidebar` family, `Toggle`, `Badge`, `Card`, `AvatarGroup`, `Sparkline`,
`DateRangePicker`, `EmptyState`, `Skeleton`, `Breadcrumb`, raw `Table`)
is built, published as `@neelamkhan21/ui@1.1.0`, and installed. Its design
tokens (the slate/red/emerald palette, the `--chart-1..8` series colors,
spacing, radii, shadows) are confirmed identical to the prototype's own —
the prototype's CSS is literally commented "transcribed from the source
component library's Tailwind utilities". Matching the prototype is a
structure-and-data job, not a re-theming job.

---

## PART 9.1–9.3 — Vite scaffold, package install, env var

Done as written, plus Tailwind v4 (`@tailwindcss/vite`, `@source
"../node_modules/@neelamkhan21/ui/dist"` in `index.css` — without that
line Tailwind's v4 content scanner never sees class names inside the
library's compiled output). `frontend/.env.local` now exists
(`VITE_API_URL=http://localhost:8000/api`, gitignored via the scaffold's
existing `*.local` rule).

---

## PART 9.4 — The app shell (as actually built)

`src/layout/AppShell.tsx` matches the prototype's sidebar/top bar exactly:

- **Sidebar**: 16rem wide, an 8px-radius 28×28 "N" logo mark, a "Views"
  group (Overview, Compare), and a "Tracked repos" group with a live
  count badge next to its label. Repo entries show the full `owner/repo`,
  not just the repo name. **No account menu, no notification bell** — the
  prototype doesn't have either, so neither does this.
- **Top bar**: sticky, 56px. Breadcrumb reads "Repositories / {page}" (not
  "OSS Health / {page}" — the first crumb names what you're browsing, not
  the product). A real `DateRangePicker` sits where a static "Last 90
  days" label used to be — it renders its own outline trigger with a
  calendar icon, so nothing wraps it. Its selection isn't lifted into app
  state yet, because no endpoint accepts a date range; wire it through
  once one does. "Sync now" is still a no-op.

`TRACKED_REPOS` (`src/lib/constants.ts`) is the single source for the
sidebar list, the Compare toggles, and (by name only — still hand-synced)
the backend's `sync.py` list.

---

## PART 9.6 — Overview page (as actually built)

Four `StatCard`s (avg. merge time, open issues, contributors, PRs merged
this week) with real sparklines and signed deltas → a `TrendChartCard`
(new, `src/components/TrendChartCard.tsx`, shared with Compare) → a
"Tracked repositories" `DataTable` with eight columns including a
`Sparkline` and a status `Badge`.

**The metric toggle is the piece the first pass missed entirely.** The
trend card carries two `Toggle`s — "Merge time" / "Issue response" — that
switch the chart's title, description, and plotted series together
(`TrendChartCard` keeps all three in the caller's single `metric` state
specifically so they can't disagree). Compare uses the exact same
component for the same reason.

The `/overview` fetch is now purely a signal, not a data source: it can
only tell you whether *anything* has synced (`repos.length === 0` → the
"no repositories synced yet" empty state, matching the prototype's, with
its 3-step "Connect GitHub / pick repos / wait for sync" cards). It has no
source for first-response time, merge rate, or status, so even once real
numbers land there, those columns still come from the placeholder dataset
— see Part 9.9. The fetch now has a 4-second `AbortSignal.timeout`: a
*refused* connection rejects immediately, but a container port that
accepts and never answers (a half-started `docker compose`, exactly the
state of this project without Part 3 running) left the promise — and the
loading skeleton — pending forever. That was a real bug in the first
pass, not a hypothetical one.

---

## PART 9.7 — Repo Detail page (all five sections, prototype-accurate)

- **Stats strip**: one `Card`, six cells divided by hairlines (stars,
  forks, open PRs, open issues, contributors, commits/week) — not six
  separate `StatCard`s. None of these six numbers has a delta or a trend
  to show, which is what a `StatCard` is *for*; a repo's stars-and-forks
  are its description, not six independent KPIs.
- **Commit heatmap** (`src/components/CommitHeatmap.tsx`) — 53 weeks ×
  7 days, **blue**, not green (`rgba(37,99,235,α)` steps up to
  `var(--chart-1)`), day-of-week and month labels, and the prototype's
  exact seeded RNG (seed from the repo id's char codes, weekend days
  capped lower, a 7% chance of a zero day, scaled by the repo's
  commits/week) so a given repo always renders the same grid.
- **Merge-time distribution + percentiles**
  (`src/components/MergeTimeDistribution.tsx`) — a legend-less bar chart
  (six duration buckets) beside one "Percentiles" card of label/value rows
  over shared-scale progress bars (all four repos' p50–p95 share one
  14.6-day max, so a bar's length is comparable across repos, not just
  within one). The first pass built this as four separate stat tiles —
  wrong shape, fixed now.
- **Contributor leaderboard** — five columns now (contributor, commits,
  PRs merged, reviews, last active), not two. Real data only fills two of
  them today; see the finding below.

---

## PART 9.8 — Compare page (all three sections, prototype-accurate)

- Copy is the prototype's own: "Compare repositories" / "Same window,
  same definitions. Merge time is measured from first commit push to
  merge."
- One `StatCard` per **selected** repo (not a custom multi-metric card),
  value and sparkline switching with the same merge/issue-response
  `TrendMetric` the trend chart below uses, each card's sparkline tinted
  to that repo's series color via a `--repo-color` CSS variable and a
  `[&_svg]:text-(--repo-color)` descendant selector (`Sparkline` draws in
  `currentColor`; this out-specifies `StatCard`'s own tone class without
  fighting its merge order).
- **"Core metrics" is transposed**: one column per selected repo, one row
  per metric, with the best value in each row bolded and badged "Best"
  (lower-is-better vs. higher-is-better tracked per row, the same
  distinction `StatCard`'s `deltaDirection` draws). Built on raw `Table`,
  not `DataTable` — `DataTable` is one row per record, which is exactly
  the orientation this table inverts, and sorting/filtering six fixed
  metric rows isn't a meaningful operation anyway. The first pass had this
  the other way around (one row per repo) with no way to spot a winner at
  a glance.
- The same `TrendChartCard` Overview uses, filtered to the selected repos.

---

## PART 9.9 — What's still placeholder, and the endpoints that replace it

`frontend/src/lib/mockData.ts` is the single source every page reads
placeholder numbers from — one `MOCK_REPOS` array, typed (`MockRepo`,
`MetricValue`, `MockContributor`), each repo's full field set ported
verbatim from the prototype so the UI can be compared against it directly.
Its header comment now splits the backend gap into two tiers, which is a
more useful way to plan the remaining backend work than one flat list:

**Tier 1 — computable today, just not exposed yet.** `merge`
(avg. time to merge), `mergeRate`, `issues`, `contrib`, `commits`, `dist`
(the merge-time histogram) and `pct` (its percentiles): `PullRequest` has
`created_at`/`merged_at`, `Contributor` has `contributions` — these are
aggregation queries away, the Part 11 work already scoped.

**Tier 2 — no schema equivalent at all; a data-model change comes before
the endpoint does.**

| Field(s) | Why it's tier 2 |
|---|---|
| `response` / `trendIssue` (median time to first maintainer reply) | `Issue` has no comment tracking at all — no comments table, no `first_response_at`. Needs the issue-comments API synced (a second, rate-limit-hungry call per issue) plus a definition of "maintainer" the sync can evaluate. |
| `stars`, `forks` | Never synced — on the repo payload the sync already fetches, so cheap to add, but point-in-time only; trending them needs a snapshot table. |
| `openPrs` | `PullRequest` has no state column, only `merged_at` — "open" isn't currently distinguishable from "closed unmerged". |
| `status` / `statusVariant` | Not a metric, a *policy* ("Healthy" vs. "Backlog growing") — someone has to define the thresholds before this is computed rather than asserted. |
| `top[].prs` / `top[].reviews` / `top[].last` | `Contributor` stores one `contributions` count; per-contributor PR/review counts and a last-active timestamp are three more fields the sync doesn't collect. |

**A real, live bug, found building this**: `GET /repos/{id}/contributors`
takes the integer `Repo.id`, but every page routes on `owner/name` — so
that call **422s today** and always has. `RepoDetail`'s leaderboard now
merges real rows in when they do arrive (real login + commit count, an em
dash for the three columns the API can't answer regardless) rather than
silently blending real and invented numbers or dropping the response
entirely — but the route mismatch itself is still open. Fixing it properly
means either a `/repos/by-name/{owner}/{name}/...` route or resolving the
id server-side first.

| UI piece | Reads from | Needs |
|---|---|---|
| Overview cards/table, RepoDetail stats strip/heatmap/distribution, Compare | `MOCK_REPOS` in `mockData.ts` | Tier 1 fields: the Part 11 optimized `/stats` endpoint, extended with `mergeRate`/`dist`/`pct`. Tier 2 fields: see above — each needs schema work before it needs a route. |
| RepoDetail contributor leaderboard | `/repos/{id}/contributors` (422s) → `repo.top` | Fix the id/owner-name routing mismatch first; then the 3 tier-2 per-contributor fields. |
| Overview empty vs. ready state | `/overview`'s `repos.length` | Nothing new — already cuts over correctly; it just can't supply the columns above once it does. |
| Compare page | `MOCK_REPOS` only, no fetch | A `/compare?repos=...` endpoint, most simply the `/stats` endpoint above called once per selected repo and merged client-side. |

---

*(Parts 10–14 — baseline measurement, the query optimization, Redis
caching, code splitting and image handling — are done; what they actually
measured is written up in `PERFORMANCE.md`, including the two places the
original guide's premise didn't survive contact with this codebase.*

*Parts 15–19 — the final measurement pass, the README, CI, and AWS
deployment — have been **revised** and now live in `DEPLOY_GUIDE.md`. They
are not unchanged: adding authentication (Parts 00–02) broke the original
guide's deployment architecture, its CI snippet predates the tests that now
exist (one of which fails), and its Kubernetes Secret references a
`JWT_SECRET` this app deliberately doesn't have.)*
