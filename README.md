# OSS Health Dashboard

**Live: [oss-dashboard.duckdns.org](https://oss-dashboard.duckdns.org)**

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
                              ├── caddy  TLS, automatic certificate renewal
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

Live on **single-node k3s**, on an Oracle Cloud Always Free VM (Ampere ARM,
free indefinitely). Everything runs inside the cluster — Postgres as a
StatefulSet, Redis, the API, the Celery worker and beat, nginx serving the
frontend, and Caddy terminating TLS:

```bash
cp deploy/deploy.env.example deploy/deploy.env   # Docker Hub user, host, DuckDNS
cp k8s/secret.example.yaml k8s/secret.yaml       # DB password, GitHub token, OAuth
task deploy:images                               # multi-arch: arm64 + amd64
task deploy:remote                               # ~5 minutes to live
```

`task deploy:up` / `deploy:down` deploy the same manifests to a throwaway AWS
instance instead, for about 3p an hour.

**Why not AWS always-on.** This AWS account postdates July 2025, so it's on the
credit-based free plan — there is no 750-free-hours allowance for EC2, RDS or
ElastiCache. Managed Postgres and Redis running continuously would have been
about **$39/month**. Moving both into the cluster took it to ~$11/month, and
moving the whole thing to Oracle's Always Free tier took it to **£0**, with a
permanently live URL rather than one that only exists during a demo.

HTTPS is a free DuckDNS subdomain plus Caddy obtaining and renewing a
certificate in-cluster, which is also what makes GitHub and Google sign-in
possible — both providers need a callback URL that doesn't move, and Google
refuses non-HTTPS redirect URIs outright.
