# Performance

Re-measured 2026-08-31 against this repo at HEAD (local Docker Compose
stack, real synced data, Celery worker and beat paused so nothing competed
for the box). This supersedes the 2026-08-25 pass, whose numbers were taken
before `sync.py` paginated — every repo then held ~100 PRs, where the same
repos now hold 1,000–1,800.

Nothing here is illustrative. Where a number wasn't captured, that's stated
rather than filled in with a guess.

## The dataset these numbers describe

| Repo | PRs | Issues | Commits | Contributors |
|---|---|---|---|---|
| microsoft/vscode | 1,818 | 1,464 | 2,264 | 100 |
| facebook/react | 1,048 | 217 | 869 | 100 |
| vuejs/core | 1,027 | 213 | 424 | 101 |

Roughly 10–18x the volume the previous measurement ran against. Everything
below is a warm Postgres, single uvicorn worker, `--reload` on, on a laptop.

## Backend: latency and query counts

Median of 3 runs each. "Cold" clears the relevant Redis keys before every
run; "cached" is the immediately-following repeat. Query counts come from
the SQLAlchemy event listeners in `services/query_debug.py`.

| Endpoint | Cold | Queries | Cached | Queries |
|---|---|---|---|---|
| `/repos/1/stats-naive` (react) | 19.8ms | 3 | *not cached by design* | 3 |
| `/repos/3/stats-naive` (vscode) | 34.2ms | 3 | *not cached by design* | 3 |
| `/repos/facebook%2Freact/stats` | 8.6ms | 3 | 6.2ms | 2 |
| `/repos/microsoft%2Fvscode/stats` | 7.9ms | 3 | 6.1ms | 2 |
| `/repos/facebook%2Freact/full?days=90` | 44.8ms | 37 | 7.5ms | 2 |
| `/repos/microsoft%2Fvscode/full?days=90` | 55.1ms | 37 | 8.0ms | 2 |
| `/overview?days=90` (1 repo) | 135.1ms | 95 | 6.7ms | 1 |
| `/overview?days=90` (3 repos) | 189.7ms | 165 | 9.4ms | 1 |
| `/overview?days=90` (7 repos) | 396.9ms | 305 | 13.5ms | 1 |
| `/repos` (tracked list) | 8.0ms | 5 | *not cached* | 5 |

Every row includes the one extra query `get_current_user` adds (`db.get(User,
…)` after the Redis session lookup) — that's the fixed cost of authentication
on every authenticated request, and it's the difference between these counts
and the previous pass's.

### `/stats-naive` vs `/stats`: still not an N+1, but now a real gap

The 2026-08-25 pass established that `repo_stats_naive` was never N+1 —
`Repo.pull_requests` is `lazy="select"`, so it loads the whole collection in
one query and averages in Python. That's still true. What changed is that
the collection is now 10–18x bigger, so the cost of doing that work in
Python instead of SQL is finally visible:

- react (1,048 PRs): **19.8ms → 8.6ms**, a 2.3x improvement
- vscode (1,818 PRs): **34.2ms → 7.9ms**, a 4.3x improvement

Note the shape: the SQL-aggregate endpoint costs the same ~8ms on both
repos, while the Python-side one grows with row count. That's the actual
claim worth making — not "N+1 eliminated" but *the work moved to where it
doesn't scale with the result set*. At the previous 100-PR ceiling this gap
was invisible (47ms vs 37ms, mostly noise).

**The `total_prs` contract mismatch flagged last time is still open**:
`/stats-naive` counts every synced PR, `/stats` counts merged ones only
(`PullRequest.merged_at.isnot(None)`). Same field name, different meaning,
and now a much bigger absolute divergence.

### `/overview` *is* the N+1 — 35 queries per tracked repo

This is the finding the earlier pass missed by looking at the wrong
endpoint. `/overview` calls `compute_repo_full` once per tracked repo in a
list comprehension, then runs a fixed block of KPI queries. Measured at 1,
3 and 7 repos, the query count fits exactly:

```
queries = 2 + 58 + (35 × tracked repos)
          │    │           └─ compute_repo_full, once per repo, in a loop
          │    └───────────── fixed KPI + sparkline block (see below)
          └────────────────── session user lookup + the tracked-repo join
```

| Tracked repos | Predicted | Measured |
|---|---|---|
| 1 | 95 | **95** |
| 3 | 165 | **165** |
| 7 | 305 | **305** |

The 58 fixed queries are worth breaking out, because 48 of them are
sparklines: `open_issues_sparkline` is 12 queries (one per month),
`contrib_sparkline` is 24 (two per month — PR authors and commit authors as
separate `DISTINCT` queries), `prs_sparkline` is 12 (one per week). Each is
a loop issuing one round trip per data point where a single `GROUP BY` over
the whole window would do.

A user tracking 10 repos would issue **410 queries** on a cold `/overview`.
That's the real optimization target in this codebase, and it's untouched.

### Load test

`hey -n 200 -c 10`, authenticated with a session cookie.

| Workload | p50 | p90 | p95 | p99 | req/s |
|---|---|---|---|---|---|
| `/stats-naive` (uncached, Python-side aggregation) | 217ms | 279ms | 293ms | 335ms | 45.2 |
| `/stats` (cached) | 38ms | 53ms | 63ms | 81ms | 243.9 |
| `/overview?days=90` (cached) | 71ms | 92ms | 101ms | 130ms | 136.1 |
| `/overview?days=90` (**uncached**) | 1,510ms | 1,639ms | 1,674ms | 1,796ms | 6.5 |

The uncached `/overview` row needed a trick to measure honestly: the cache
key is `overview:{user}:{days}`, so hammering one URL only ever misses once.
Instead, 100 requests each used a distinct `days` value (41–140) at
concurrency 10, making every single one a genuine miss. The varying window
does mean slightly varying work per request, which is noted rather than
hidden.

**That row is the case for the cache**: 6.5 → 136 req/s and 1,510 → 71ms at
p50, both about **21x**. Unlike the previous pass — where caching bought
roughly 2x because even the uncached path was already fast — the current
data volume makes the uncached path genuinely slow, and Redis is what stands
between the dashboard's landing request and a 1.5-second wait.

It also means the cache is load-bearing, not a nicety. With a 900s TTL
matched to the sync cadence, the first request after every sync pays that
1.5s; a `n`-repo user pays proportionally more.

## Frontend: bundle size

Both builds are the **same commit**, differing only in whether `pages/lazy.tsx`
and `LazyTrendChartCard.tsx` use `lazy(() => import(...))` or static
re-exports — so this is a true A/B, not a comparison against an older
snapshot of a smaller app.

| | No code splitting | With code splitting |
|---|---|---|
| Initial JS (what `index.html` actually loads) | 781.76 KB (221.58 KB gzip) | **367.59 KB (107.63 KB gzip)** |
| Deferred to on-demand chunks | 0 KB | 420.48 KB (125.36 KB gzip) |
| Chunks emitted | 1 | 12 |

**53.0% smaller initial payload** (51.4% gzipped). Verified by parsing
`dist/index.html` and summing only the files it eagerly references (the
entry `<script>` plus its `modulepreload` links) — Recharts
(`CartesianChart`, 339 KB) and all four routes are absent from that set.

## Frontend: Lighthouse

Production build, served by `vite preview`, LHCI default mobile preset with
simulated throttling, 3 runs each. The API was proxied through the preview
server at `/api` so the page and its data requests share an origin — the
same arrangement `DEPLOY_GUIDE.md` specifies for production, and the only
way to audit the signed-in dashboard without CORS interfering.

Two pages are audited because the app has an auth guard now: `/` redirects
a signed-out browser to `/login`, so a naive audit of `/` measures the login
screen. The signed-in runs carry a session cookie via `extraHeaders`.

| | Login (out) — no split | Login (out) — split | Overview (in) — no split | Overview (in) — split |
|---|---|---|---|---|
| Performance | 0.96 | **0.98** | 0.95 | **0.98** |
| FCP | 2.11s | **1.76s** | 2.11s | **1.65s** |
| LCP | 2.41s | **2.01s** | 2.65s | **2.22s** |
| CLS | 0 | 0 | 0 | 0 |
| TBT | 23–37ms | **0–2ms** | 49–52ms | 48–52ms |
| Speed Index | 2.11s | **1.76s** | 2.11s | **1.65s** |

**This closes the gap the previous pass flagged.** It listed "capture a
genuine Lighthouse *before*" as an open next step, because the original
baseline attempt failed on a directory mistake and was never retried. The
table above is that before/after, taken the honest way — same code, one
variable changed:

- Login: **LCP −0.40s (−17%)**, FCP −0.35s, TBT effectively to zero.
- Overview: **LCP −0.43s (−16%)**, FCP −0.46s (−22%).

Modest in absolute terms, and worth saying why: on a fast local connection
even 782 KB arrives quickly, so the byte-count win compresses into a
few hundred milliseconds. On the 1.6 Mbps mobile profile Lighthouse
simulates it's already worth ~0.4s of LCP; on a real slow connection the
gap widens further.

LCP also improved against the earlier pass's 2.8–2.9s, but those runs aren't
comparable to these (different machine state, different app, no auth guard,
different server), so no delta is claimed there.

### Non-performance findings from the same runs

- **Accessibility 0.96 on the login page** — one real contrast failure:
  `#90a1b9` (slate-400) on white at 12px is 2.63:1, below the 4.5:1
  threshold. The signed-in dashboard scores **1.00**.
- **Best practices 0.96 on the login page** — caused by the expected
  `401` from `/auth/me` when signed out being logged as a console error.
  Cosmetic, but it's a real audit failure and would fail a strict CI gate;
  swallowing that specific 401 in `authContext` would fix it. Signed in:
  **1.00**.
- **SEO 0.82 on both** — no meta description, and no valid `robots.txt`.
  Two lines of work if it matters for a portfolio piece.
- **CLS is 0** everywhere, as before — and still not because of any image
  fix. Part 14 remains not applicable (see below).

## Part 14 (image sizing): still doesn't apply

Unchanged from the previous pass, re-confirmed: the only raw `<img>` tags
are in `App.tsx`, leftover Vite scaffolding that `main.tsx` never imports.
Every avatar in the shipped app renders `AvatarFallback` initials by design,
matching the prototype. Wiring up real `AvatarImage`s from the `avatarUrl`
the backend already returns is a feature, not an optimization.

## Bugs found while measuring

1. **The production build rendered a blank page.** `npm run build` succeeded
   and the app mounted nothing — `#root` stayed empty with `Uncaught
   TypeError: Cannot read properties of null (reading
   'useSyncExternalStore')` from the UI library's `Toast`. Cause:
   `neelam-ui` is installed as a **symlink** to the local
   `component-library` checkout, which carries its own `node_modules/react`,
   so the build bundled two React copies. Dev survived it; `vite build` did
   not. Fixed with `resolve.dedupe: ['react', 'react-dom']` in
   `vite.config.ts`. Every Lighthouse number above was taken after this fix;
   before it, there was nothing to measure.
2. **`main` didn't typecheck.** An unused `i` in `RepoStatsRow.tsx`'s
   `stats.map(([label, value], i) =>` failed `tsc -b`, so `npm run build`
   exited 1 on a clean checkout. Committed, not a local edit. Removed.
3. **`/debug/query-count` and its reset endpoint were public.** Registered
   on `app` rather than the auth-guarded dashboard router, so they'd have
   been world-readable in production. Removed now that they've served their
   purpose; `services/query_debug.py` stays for local use.
4. **A cache-invalidation gap.** `sync_one_repo` invalidates `repo_full:*`
   and `overview:*` but not `repo_stats:{id}`, so `/stats` can serve
   pre-sync data for up to its full 900s TTL while its siblings are fresh.
   Bounded, but inconsistent — and not obvious from reading either file
   alone.

## Next real steps, in priority order

1. **Collapse `/overview`'s sparkline queries.** 48 of its 58 fixed queries
   are one-round-trip-per-data-point loops; three `GROUP BY` queries would
   replace them. Biggest single win available, and it shrinks with no schema
   change.
2. **Stop calling `compute_repo_full` per repo in `/overview`.** 35 queries
   per tracked repo is the actual N+1 in this codebase. Batching the
   per-repo aggregates by `repo_id IN (…)` is the same technique `/stats`
   already demonstrates, applied one level up.
3. **Fix the `repo_stats:` invalidation gap** (#4 above).
4. **Reconcile `total_prs`** between `/stats-naive` and `/stats` before
   anything is built on either number.
5. **Decide what `neelam-ui` resolves to.** `package.json` declares
   `^1.1.0` from the registry; the working tree has a symlink to a local
   `1.2.1`. CI and any deploy will build against different code than
   development does. The `dedupe` fix makes the symlink safe, but it doesn't
   make the two environments the same.
6. **The login page's contrast failure and the console-logged 401** — both
   small, both would fail the accessibility gate `DEPLOY_GUIDE.md` Part 16
   proposes for CI.
