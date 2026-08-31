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
**Infrastructure** — Docker Compose locally; k3s in deployment, with Postgres
and Redis in-cluster, on either an Oracle Always Free VM or an on-demand EC2
instance.

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
                              ├── caddy  TLS, Let's Encrypt (when a hostname is set)
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

Runs on **single-node k3s**, with everything — Postgres, Redis, the API, the
Celery worker and beat, and nginx serving the frontend — inside the cluster
behind one entry point.

Two supported targets, because the hosting decision turned out to be the
interesting part:

```bash
cp deploy/deploy.env.example deploy/deploy.env   # Docker Hub user, host, optional hostname
cp k8s/secret.example.yaml k8s/secret.yaml       # DB password, GitHub token
task deploy:images                               # multi-arch: arm64 + amd64

task deploy:remote     # deploy to a host you already have — free, always on
task deploy:up         # or: create a throwaway AWS instance, ~$0.03/hour
task deploy:down       # and destroy it
```

**Why not just always-on AWS.** This account was created after July 2025, so
it's on the credit-based free plan rather than the classic 12-month free tier —
there is no 750-free-hours allowance for EC2, RDS or ElastiCache. Managed
Postgres and Redis running always-on would have been about **$39/month**.
Moving both into the cluster took that to ~$11/month, and the remaining cost is
simply the machine.

So there are two ways to pay nothing. `task deploy:up` creates an AWS instance
on demand and `task deploy:down` destroys it, which costs about 3p an hour and
nothing in between. `task deploy:remote` deploys to a machine that is already
free and always on — an Oracle Cloud Always Free VM (4 ARM cores, 24 GB, free
indefinitely) — which is the same manifests, the same k3s, and a permanently
live URL.

Set a free [DuckDNS](https://www.duckdns.org) subdomain and token in
`deploy/deploy.env` and either target comes up at
`https://<subdomain>.duckdns.org` with a Let's Encrypt certificate obtained and
renewed by Caddy in the cluster. That is what makes OAuth work: GitHub and
Google both need a callback URL that doesn't move.

Images are built for **arm64 and amd64** together, and `deploy:remote` checks
the host's architecture before deploying — a mismatch pulls cleanly and then
dies with `exec format error`, which is a miserable thing to debug in a pod.

Two honest limitations, both deliberate:

- **Single node**, so this demonstrates writing Kubernetes manifests and
  operating a cluster — StatefulSets, PVCs, Jobs, probes, rolling restarts,
  autoscaling — not multi-node scheduling.
- **In-cluster Postgres** means no managed backups, point-in-time restore or
  failover. Fair for a dashboard whose dataset can be rebuilt by re-running the
  sync; not fair for anything holding real users' data.

`DEPLOY_GUIDE.md` carries the reasoning, including the managed-services
variant (RDS, ElastiCache, CloudFront) if the cost calculus ever changes.

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
- **OAuth needs the DuckDNS hostname configured.** With it, GitHub and Google
  sign-in work like any other deployment. Without it the stack runs on a bare
  IP that changes each deploy, and only email-and-password sign-in works.
- **Login page contrast**: one 12px slate-400-on-white label sits at 2.63:1,
  below the 4.5:1 threshold.
