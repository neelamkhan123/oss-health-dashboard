# Performance

Every number below was actually measured against this repo (Docker Compose
stack, real synced data for `facebook/react`/`vuejs/core`/`microsoft/vscode`,
2026-08-25). Nothing here is illustrative — where a number wasn't captured,
that's stated instead of filled in with a guess.

## Backend: query count and response time

**The headline "N+1 → 1 query" story the guide sets up doesn't actually
apply to this codebase, for two independent reasons — both real findings,
not a wording nitpick:**

1. `Repo.pull_requests` uses SQLAlchemy's default `lazy="select"`, which
   loads the *entire* related collection in one query the first time it's
   touched — not one query per row. `repo_stats_naive` was never actually
   N+1; it was always exactly 2 queries (the repo, then all its PRs at
   once), computing the average in Python instead of SQL.
2. `_sync_pull_requests` only ever fetches one page (`per_page: 100`, no
   pagination loop), so every tracked repo caps around 100–130 synced PRs
   regardless of its real size — nowhere near the "thousands" that would
   make the Python-vs-SQL aggregation cost show up in wall-clock time
   anyway.

So the real optimization story here is **SQL-side aggregation replacing
Python-side aggregation**, not N+1 elimination — a smaller but still real
and legitimate improvement.

| Endpoint | Repo | Queries | Response time | `total_prs` |
|---|---|---|---|---|
| `/stats-naive` | facebook/react | 2 | 47ms (cold), 7–8ms (warm) | 102 (all PRs) |
| `/stats-naive` | vuejs/core | 2 | 7.7ms | 100 |
| `/stats-naive` | microsoft/vscode | 2 | 7.6ms | 126 |
| `/stats` (optimized, cold) | facebook/react | 2 | 37ms | 9 (**merged only**) |
| `/stats` (optimized, cached) | facebook/react | **0** | 3.7ms | 9 |

**A correctness bug, not just a performance one**: `/stats-naive`'s
`total_prs` counts *every* synced PR; `/stats` (Part 11's own snippet)
counts only merged ones (`PullRequest.merged_at.isnot(None)`). For
facebook/react that's 102 vs. 9 — a >10x difference in what the same field
name means between the two endpoints. Implemented exactly as the guide
specifies; flagging the mismatch rather than silently changing the
contract.

### Load test — `/stats`, uncached vs. cached (`hey -n 200 -c 10`)

| | p50 | p90 | p95 | p99 | req/s |
|---|---|---|---|---|---|
| Uncached (real Postgres aggregate query every request) | 42.0ms | 58.6ms | 63.9ms | 74.8ms | 211 |
| Cached (Redis, 900s TTL) | 22.2ms | 28.4ms | 33.5ms | 46.0ms | 493 |

Roughly 2x, not the order-of-magnitude the guide's illustrative table
shows — consistent with the dataset being small enough that even the
uncached path is already fast; caching removes a fast Postgres round trip,
not a slow one. The gap would widen with the realistic PR volumes noted
above.

## Frontend: bundle size (Part 13, route + chart code splitting)

| | Before | After |
|---|---|---|
| Initial JS (what `index.html` actually loads) | 746.26 KB (214.57 KB gzip) | 349.23 KB (101.14 KB gzip) |
| Loaded on demand (Overview/RepoDetail/Compare + Recharts, only when visited) | — (all of it, always) | ~397 KB raw / ~113 KB gzip, split across 7 chunks |

**53% reduction in initial JS payload** (746.26 → 349.23 KB raw). Verified
by reading `dist/index.html` directly — only the entry chunk and CSS are
eagerly `<script>`-tagged; every page and `TrendChartCard`'s Recharts
import are `dynamic import()`s that show up as separate files and are
absent from the initial network waterfall.

## Frontend: Lighthouse (production build, `serve dist` on :3000, 3 runs)

|Metric | Value |
|---|---|
| Performance score | 0.93–0.94 |
| LCP | 2.8–2.9s |
| FCP | 1.6s |
| CLS | 0 |
| TBT | 130–140ms |
| Speed Index | 1.7–1.9s |

**No true before/after delta for these** — the first attempt at a
baseline (Part 10.1) failed on a directory/backgrounding mistake before
any optimization work started, and it wasn't re-attempted before Part 11+
began. This table is a single post-optimization snapshot, not a
comparison. CLS is already 0, but not because of an image-sizing fix —
Part 14 turned out not to apply (see below) — the app just never had
layout-shifting content.

LCP at 2.8–2.9s is on the high side (Lighthouse's "needs improvement"
band starts around 2.5s) despite the bundle-size win — main-thread work
and one render-blocking resource (the CSS file) are the flagged causes;
neither was addressed here, both are real next steps.

## Part 14 (image sizing): doesn't apply, checked rather than assumed

There are no unsized `<img>` tags to fix. The **only** raw `<img>`s in the
codebase are in `App.tsx` — leftover Vite scaffolding never imported by
`main.tsx`, not part of the shipped bundle. Every real avatar in the app
(contributor leaderboard, avatar groups) renders `AvatarFallback` initials
only, by design — that's what the actual Claude Design prototype does too
(confirmed against its decoded source), not an oversight to "fix." Wiring
up real `AvatarImage`s using the `avatarUrl` the backend already returns
would be a legitimate feature, but it's a design change (the prototype
doesn't show photos), not this optimization pass's job — noted for anyone
picking that up later.

## Bugs found and fixed doing this measurement (not in the original guide)

1. **The `api` container had been crash-looping for 26 hours**, invisible
   in `docker ps` (`--reload`'s supervisor process stays "Up" even when
   the app underneath it can't import). Root cause: `auth.py` uses
   Pydantic's `EmailStr`, which needs the `email-validator` package —
   never in `requirements.txt`. Fixed by adding it; this was silently
   broken since Part 7 was first written.
2. **`func.avg(func.extract(...))` returns a `Decimal`** from Postgres,
   which the stdlib `json` module (used by the new Redis cache) can't
   serialize — `/stats` 500'd the instant caching was added on top of it.
   Fixed with an explicit `float()` cast before any arithmetic.
3. **A stray root-level `package.json`** (holding `web-vitals` and
   `@lhci/cli`) existed because those were `npm install`ed from the repo
   root instead of `frontend/` at some point. Node's upward `node_modules`
   resolution meant the frontend build "worked" by accident — silently
   depending on files outside its own directory that a clean checkout or
   CI wouldn't have. Fixed by installing both properly into
   `frontend/package.json` and removing the root copy.

## What changed

1. **Query optimization** (Part 11) — added `GET /repos/{id}/stats`, a
   single SQL aggregate query replacing Python-side averaging. Not an N+1
   fix (see above) — a real reduction in what the database and Python each
   have to do per request.
2. **Redis caching** (Part 12) — `/stats` responses cached 900s (matches
   the sync job's cadence), invalidated on every sync. GitHub API
   responses cached 300s across all three sync calls (PRs, issues,
   contributors), not just PRs as the guide's snippet showed.
3. **Code splitting** (Part 13) — routes and the chart library
   (`TrendChartCard`, the only thing importing Recharts) are lazy-loaded.
   53% smaller initial payload, verified against the actual built
   `index.html`, not estimated.
4. **Image sizing** (Part 14) — not applicable; verified rather than
   assumed. See above.

## Next real steps, in rough priority order

- Fix `_sync_pull_requests`/`_sync_issues` to actually paginate — the
  entire "before" story here is capped by a ~100-row ceiling that has
  nothing to do with the repos' real size.
- Reconcile `total_prs`'s meaning between `/stats-naive` and `/stats`
  before anyone builds a feature on either number.
- Capture a genuine Lighthouse *before* — checkout the commit before Part
  13's code-splitting, rebuild, re-run, so the bundle-size win has an LCP
  delta to point to, not just a byte-count delta.
- Address the render-blocking CSS and main-thread-work findings surfaced
  by this Lighthouse run — separate from anything Part 11–14 touched.
