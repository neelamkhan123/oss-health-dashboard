# OSS Health Dashboard

A dashboard for tracking the health of open-source repositories. It syncs
pull requests, issues, commits and contributors from the GitHub API on a
schedule, then reports the things a maintainer actually wants to know: how
long PRs take to merge, whether the issue backlog is growing, who's active,
and how any of that has moved over the last 90 days. Repos are tracked
per user, compared side by side, and drilled into individually.

<!-- Screenshot: Overview in light mode and RepoDetail in dark mode. -->

## Stack

**Backend** — FastAPI, Postgres (SQLAlchemy + Alembic), Redis, Celery worker
and beat.
**Frontend** — React 19, Vite, React Router, Tailwind 4, Recharts, and
[`@neelamkhan21/ui`](https://www.npmjs.com/package/@neelamkhan21/ui) — my own
component library, built as a separate project and consumed here as a real
dependency.
**Infrastructure** — Docker Compose locally, k3s on a single EC2 instance for
deployment, with Postgres and Redis running in-cluster.

## Running it locally

You need Docker and Node. Everything else is a Task target.

```bash
cp .env.example .env        # then put a real GITHUB_TOKEN in it (public_repo scope)
task setup                  # env files, npm install, build images, run migrations
task dev                    # backend in the background, Vite dev server in the foreground
```

Then `task sync` to pull GitHub data immediately instead of waiting for
beat's 15-minute schedule, and `task --list` for the rest — `logs`, `psql`,
`redis-cli`, `migrate:new`, `test`, `clean`.

Without a real `GITHUB_TOKEN` the app still boots; the sync job just 401s and
there's nothing to display.

## Architecture

```
browser ──▶ EC2 instance ──▶ k3s
                              │
                              ├── web    nginx: serves the SPA, proxies /api
                              ├── api    FastAPI
                              ├── worker Celery ──▶ GitHub API
                              ├── beat   Celery scheduler, every 15 min
                              ├── redis  cache + session store + broker
                              └── postgres (StatefulSet + PVC)
```

Everything runs inside the cluster, behind one entry point. nginx serves the
built frontend and proxies `/api` to the API Service, which means the browser
sees a single origin — no CORS, no mixed content, and the session cookie stays
first-party. It also means nothing in the build knows the deployment's address,
which is what lets the whole stack be destroyed and recreated at a different IP.

The API, worker and beat are three separate Deployments running the same image
with different commands, so each scales and restarts independently. Beat is
pinned to one replica — a second would double-fire every scheduled sync.

## Authentication

Email + password, plus GitHub and Google OAuth. Sessions are **opaque random
tokens stored in Redis**, handed to the browser as an httpOnly cookie — not
JWTs.

That was a deliberate choice. A JWT is only as revocable as its expiry:
anyone holding a still-valid one stays authenticated no matter what the
server does, so "sign out" can delete the browser's copy but nothing
server-side, and a leaked token can't be killed. A token that's just a lookup
key into Redis makes revocation a `DEL` — logout, and any future "sign out
everywhere", end the session immediately and everywhere. The tradeoff is a
Redis round trip on every authenticated request, which the numbers in
[PERFORMANCE.md](PERFORMANCE.md) price at one extra query.

## Performance

Measured, not estimated — see **[PERFORMANCE.md](PERFORMANCE.md)** for the
full write-up, including the places where the optimization I set out to
demonstrate turned out not to be the one that was actually there.

The headlines, all from the current dataset (~1,000–1,800 PRs per repo):

- **Redis caching: 21x** on the dashboard's landing request — `/overview`
  goes from 1,510ms to 71ms at p50, and from 6.5 to 136 req/s under
  concurrency 10.
- **SQL-side aggregation: 2.3–4.3x** over the naive Python-side version, and
  flat in the number of rows rather than growing with it.
- **Code splitting: 53% smaller initial JS** (782 KB → 368 KB), worth about
  0.4s of LCP on Lighthouse's simulated mobile connection.
- **Lighthouse 0.98** performance, **CLS 0**, on both the login page and the
  signed-in dashboard.

## Deployment

Deployed to AWS on **single-node k3s**, and deliberately **ephemeral**: the whole
stack is created when it's needed and destroyed afterwards.

```bash
export DOCKERHUB_USER=your-user
task deploy:images     # build both images for linux/amd64, push to Docker Hub
task deploy:up         # instance + k3s + the whole stack, ~5 minutes
task deploy:status     # is anything running (and therefore billing)?
task deploy:down       # destroy it all
```

This is a cost decision, made after checking rather than assuming. This AWS
account was created after July 2025, so it's on the credit-based free plan
rather than the classic 12-month free tier — there is no 750-free-hours
allowance for EC2, RDS or ElastiCache. Running managed Postgres and Redis
always-on would have been roughly **$39/month**. Moving both into the cluster
and running the instance only while it's in use brings that to a few pennies an
hour, with nothing billing between demos.

Two honest limitations, both deliberate:

- **Single node**, so this demonstrates writing Kubernetes manifests and
  operating a cluster — StatefulSets, PVCs, Jobs, probes, rolling restarts,
  autoscaling — not multi-node scheduling.
- **In-cluster Postgres** means no managed backups, point-in-time restore or
  failover. Fair for a dashboard whose entire dataset can be rebuilt by
  re-running the sync; not fair for anything holding real users' data.

`DEPLOY_GUIDE.md` carries the reasoning, including the managed-services variant
(RDS, ElastiCache, CloudFront) if the cost calculus ever changes.

## Known gaps

- **`/overview` is an N+1.** 35 queries per tracked repo, plus 48 more for
  sparklines that issue one query per data point. A 10-repo user costs 410
  queries on a cold request. The cache hides it; it isn't fixed.
- **`total_prs` means different things** in `/stats-naive` (all PRs) and
  `/stats` (merged only).
- **One backend test fails.** `test_overview_endpoint_responds` predates the
  auth guard and asserts 200 where the endpoint now correctly returns 401.
  Fixing it is the first step of the CI work in `DEPLOY_GUIDE.md` Part 16.
- **CI doesn't exist yet** — `.github/workflows/` is unwritten; the workflow
  is specified but not committed.
- **`@neelamkhan21/ui` resolves to a local symlink** in this working tree
  (v1.2.1) while `package.json` declares `^1.1.0` from npm, so CI and
  production build against different code than development does.
- **Sparse mock data.** `lib/mockData.ts` still backs a few fields with no
  schema equivalent yet — per-contributor PR/review counts, time-to-first-
  response trends, and the "Healthy"/"Backlog growing" status, which is a
  policy decision nobody has defined thresholds for.
- **The Watch button needs the `repo` OAuth scope**, not just `public_repo`;
  with a narrower token it surfaces GitHub's 403 rather than working.
- **OAuth sign-in needs a stable callback URL**, which an ephemeral public IP
  isn't. Email and password work on every deploy; GitHub and Google sign-in
  need a fixed hostname in front of the instance first.
- **Login page contrast**: one 12px slate-400-on-white label sits at 2.63:1,
  below the 4.5:1 threshold.
