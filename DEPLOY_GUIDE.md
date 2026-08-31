# Parts 15–19, revised — measurement, CI, and AWS deployment

*Revised 2026-08-31 against the actual state of this repo. Supersedes the
original Parts 15–19. The original text was written before Parts 00–02
added authentication; that single change invalidates the deployment
architecture it described, so Part 18 is the section that changed most.*

**What's different, at a glance:**

| Part | Status | Why |
|---|---|---|
| 15 | **Done** (2026-08-31) | Re-measured end to end; see `PERFORMANCE.md` and `README.md`. Section kept below as the record of what was run and why |
| 16 | Rewrite | The CI snippet's `echo "add pytest here"` is obsolete — tests exist, and one of them **fails right now** |
| 17 | One addition | AWS changed the free tier in July 2025; which regime your account is under changes whether any of Part 19 is true |
| 18 | **Substantially rewritten** | Cookie-based sessions make "HTTPS frontend → plain-HTTP EC2 API" structurally broken, not just untidy. Also: no `JWT_SECRET` exists, `kubectl run --env-from` isn't a real flag, and an image built on your Mac won't run on a t3.micro |
| 19 | Updated | Free-tier caveat, plus the two paid traps in the new ElastiCache console |

---

## SUPERSEDED, 2026-08-31 — this account has no classic free tier

Checked rather than assumed, and the answer changes the architecture below.

`aws freetier get-free-tier-usage` returns **only `Always Free` entries** for
account 588301175097 — no `12 Month Free Tier` line items at all — and the
account's IAM users were created 2026-08-23, putting the account well after the
July 2025 cutover. **This account is on the credit-based free plan.** There is
no 750-hours-per-month allowance for EC2, RDS or ElastiCache; those draw down
signup credits and then bill at full price.

What the architecture in Parts 17–19 would actually have cost, always-on in
eu-west-2:

| | Monthly |
|---|---|
| RDS db.t4g.micro + 20 GB | ~$15 |
| ElastiCache cache.t3.micro | ~$13 |
| EC2 t3.micro + 30 GB gp3 | ~$11 |
| **Total** | **~$39** |

### What replaced it

Two changes, and the project is free again:

1. **Postgres and Redis moved into the cluster** (`k8s/postgres.yaml`, a
   StatefulSet with a PersistentVolumeClaim, and `k8s/redis.yaml`). That
   removes the two most expensive line items, and it is a better Kubernetes
   exercise than a managed endpoint in a connection string. The cost is real
   and worth naming: no managed backups, no point-in-time restore, no failover.
2. **The deployment became ephemeral** (`deploy/up.sh`, `deploy/down.sh`,
   `task deploy:up` / `deploy:down`). The stack is created when it's needed and
   destroyed afterwards. At roughly $0.03/hour for a t3.small, a year of
   interview demos costs less than a coffee.

A third change falls out of the second: because the public IP changes on every
deploy, **CloudFront is gone too**. A distribution's origin has to be stable,
and updating it per-deploy would add ten minutes to a five-minute startup.
Instead `k8s/web.yaml` runs nginx inside the cluster, serving the built frontend
and proxying `/api` to the API Service. That gets the same-origin property
Part 18.0 was reaching for — first-party cookie, no CORS, no mixed content —
without any CDN at all, and it's *simpler* than the two-origin distribution.

Note that the instance can now be bigger, not smaller. `deploy/config.sh`
defaults to **t3.small** rather than t3.micro: the node hosts Postgres and Redis
as well as the app pods, and once you are paying by the hour for something you
run occasionally, 2 GB of RAM costs about a penny more per hour than 1 GB.

### What this leaves open

**OAuth needs a stable callback URL**, and an ephemeral public IP is not one.
Email and password sign-in works on every deploy; GitHub and Google do not,
until there's a fixed hostname. The cheap fix is a free DuckDNS subdomain
updated on each `up`, plus Caddy in the cluster for automatic Let's Encrypt
certificates — which would also get you HTTPS. Not built yet.

### Parts 17–19 below are still accurate

They describe the managed-services deployment: RDS, ElastiCache, EC2, and the
two-origin CloudFront distribution. That is the right architecture if this ever
has real users, or on an account that does have the classic free tier — the
reasoning in 18.0 about cookies and origins is unchanged and still worth
reading. It is simply not what this project deploys today.

---

## PART 15 — Final measurement pass & README

> **Status: done, 2026-08-31.** Everything in this part has been carried out:
> the backend and frontend were re-measured against the current dataset,
> `PERFORMANCE.md` was rewritten with those numbers (including a genuine
> code-splitting before/after that the previous pass couldn't supply), the
> public `/debug/query-count` endpoints were deleted, and `README.md` was
> written. Two build-breaking bugs were found and fixed along the way — a
> production build that rendered a blank page, and a `tsc` error on `main`.
> The section below is kept as the record of what was measured and why.


### 15.1 What's already done

`PERFORMANCE.md` is written and is the good kind of performance doc — it
says "this optimization didn't apply, here's why" instead of inventing a
delta. Don't rewrite it. **Refresh it**, because three things have changed
underneath it since 2026-08-25.

### 15.2 Why the numbers need re-taking

1. **Pagination now exists.** `PERFORMANCE.md`'s top "next real step" is
   *"fix `_sync_pull_requests`/`_sync_issues` to actually paginate."* That's
   been done — `sync.py` has a `_paginate` helper (`per_page: 100`,
   `max_pages=10`). Every backend number in that file was measured against
   a ~100-row-per-repo ceiling that no longer exists. Repos now sync up to
   ~1,000 PRs and issues, which is exactly the volume at which the
   Python-vs-SQL aggregation gap it describes starts to show up in
   wall-clock time. **The re-measure is likely to make your story better,
   not worse** — that's the point of taking it again.
2. **Everything under `/api/dashboard` now requires a session.** The old
   measurement commands (`curl localhost:8000/api/dashboard/repos/1/stats`)
   return 401 today. You need a cookie:
   ```bash
   # sign up once, keep the cookie jar, reuse it for every measurement
   curl -sc /tmp/oss.jar -X POST http://localhost:8000/api/auth/signup \
     -H 'Content-Type: application/json' \
     -d '{"email":"perf@example.com","password":"a-long-enough-password"}'
   curl -sb /tmp/oss.jar -o /dev/null -w '%{time_total}\n' \
     'http://localhost:8000/api/dashboard/repos/facebook%2Freact/stats'
   ```
   For the `hey` load test, pass the cookie explicitly:
   `hey -n 200 -c 10 -H "Cookie: session=$(grep session /tmp/oss.jar | awk '{print $7}')" <url>`
3. **The endpoints themselves moved.** `/stats` is now
   `/repos/{repo_full_name:path}/stats`, not `/repos/{id}/stats`, and the
   heavier `/full` endpoint (used by RepoDetail — heatmap, distribution,
   percentiles, language breakdown) didn't exist when the old table was
   built. `/full` is the endpoint actually worth measuring now; `/stats` is
   no longer what the UI hits hardest.

Also worth resolving while you're in there: the `total_prs` contract
mismatch `PERFORMANCE.md` flags (`/stats-naive` counts all PRs, `/stats`
counts merged only) is still open.

### 15.3 The Lighthouse run — one thing to decide first

`/` now redirects to `/login` for a signed-out browser. **A Lighthouse run
against `http://localhost:3000/` measures your login page**, not the
dashboard. The old 0.93–0.94 score in `PERFORMANCE.md` was taken before the
auth guard existed, so it isn't comparable to a run you take today.

Pick one and say which in the doc:

- **Audit `/login` and label it that way.** Honest, trivially reproducible,
  and it's the real first-paint experience for a new visitor. This is the
  right default, and it's what CI should assert on (Part 16).
- **Audit the dashboard behind a session.** More representative of the app,
  but needs Lighthouse to carry a cookie
  (`lhci collect --extra-headers='{"Cookie":"session=..."}'`), and the
  session expires, so it isn't reproducible without a seeding step.

Whichever you choose, the pre-existing caveat still stands: there is no
true *before* for LCP, and the honest fix is still to check out the commit
before code-splitting, rebuild, and run it once.

### 15.4 Pre-deploy cleanup that belongs to this part

Do this **before** Part 18, because it ships to the internet otherwise.

`backend/app/main.py` registers two debug routes on `app` directly — not on
the auth-guarded dashboard router — so they'd be **publicly readable in
production**:

```python
@app.get("/debug/query-count")
@app.post("/debug/query-count/reset")
```

Their own comment says *"Not meant to ship; delete once the before/after
numbers are recorded in PERFORMANCE.md."* The numbers are recorded. Delete
both routes and the `query_debug` import (keep the module if you want the
listeners for local work; just don't expose the endpoint). Then decide
whether `/stats-naive` stays as a documented teaching artifact or goes —
either is defensible, but it currently answers with a different definition
of `total_prs` than its sibling.

### 15.5 The README (it's empty)

`README.md` exists, is untracked, and is zero bytes. This is the actual
deliverable of Part 15 — the performance table already lives in
`PERFORMANCE.md`, so the README should link to it rather than duplicate it.
Suggested outline:

```markdown
# OSS Health Dashboard
One-paragraph what-it-is + screenshot (light and dark, since you built both).

## Stack
FastAPI · Postgres · Redis · Celery (worker + beat) · React 19 / Vite ·
Tailwind 4 · your own @neelamkhan21/ui component library · k3s on EC2.

## Running it locally
Exactly two commands, because Taskfile.yaml already does the rest:
    cp .env.example .env   # then put a real GITHUB_TOKEN in it
    task setup && task dev
(Link to `task --list` for the rest — sync, psql, redis-cli, clean.)

## Architecture
A diagram or a short list: browser → CloudFront → {S3 static, EC2/k3s API},
API → RDS + ElastiCache, beat → worker → GitHub API every 15 minutes.

## Authentication
Opaque session tokens in Redis, httpOnly cookies, GitHub + Google OAuth.
Say why not JWT — services/auth.py's comment on revocability is a genuinely
good answer and worth surfacing.

## Performance
Link to PERFORMANCE.md. Don't restate the table in two places that can drift.

## Deployment
Link to DEPLOY_GUIDE.md, and name the honest limitation up front:
single-node k3s, so this demonstrates real Kubernetes manifests and real
cluster operations, not multi-node scheduling.

## Known gaps
Keep this section. It's the most credible thing in a portfolio README.
```

---

## PART 16 — CI with GitHub Actions

`.github/workflows/` does not exist yet. Create it — but the original YAML
needs five corrections before it will go green.

### 16.1 Fix the failing test first

The original guide's CI step was `echo "add pytest here as you write
backend tests"`. Tests now exist (`backend/tests/test_health.py`), and
**one of them fails today**:

```
FAILED tests/test_health.py::test_overview_endpoint_responds - assert 401 == 200
```

The test predates the auth guard. `main.py` now includes the dashboard
router with `dependencies=[Depends(get_current_user)]`, so an
unauthenticated `GET /api/dashboard/overview` correctly returns 401. Adding
a pytest step to CI without fixing this puts a red X on `main` immediately.

Two options — do the second one; it's barely more code and it's a real test:

```python
# Option A: assert the guard, not the payload
def test_overview_requires_auth():
    assert client.get("/api/dashboard/overview").status_code == 401


# Option B: sign in, then assert the shape (needs Postgres + Redis running)
def test_overview_endpoint_responds():
    email = f"ci-{secrets.token_hex(4)}@example.com"
    signup = client.post(
        "/api/auth/signup",
        json={"email": email, "password": "a-long-enough-password"},
    )
    assert signup.status_code == 200
    # TestClient keeps the session cookie on the client, same as a browser
    response = client.get("/api/dashboard/overview")
    assert response.status_code == 200
    assert "repos" in response.json()
```

Note that Option B's signup calls `track_default_repos`, which queues Celery
work — fine in CI (no worker consumes it, the queue just fills), but it's
why the test needs Redis reachable, not just Postgres.

### 16.2 What else the workflow needs

- **Env vars, or the import fails.** `Settings` in `config.py` declares
  `database_url`, `redis_url` and `github_token` with no defaults, so
  `from app.main import app` raises a `ValidationError` at collection time
  if they're unset. `GITHUB_TOKEN` can be any non-empty dummy string in CI —
  nothing in these tests calls GitHub.
- **A Redis service.** Sessions and cache both live there now. Postgres
  alone isn't enough.
- **Migrations.** `alembic upgrade head` before pytest, or every DB-touching
  test hits a schema-less database.
- **Working directory.** `pytest.ini` sets `pythonpath = .` relative to
  `backend/`, so pytest must run from `backend/`.
- **Lighthouse mechanics.** `@lhci/cli` is already a devDependency, so don't
  `npx` a fresh copy. Also, the original's
  `npx serve dist & npx wait-on ...` backgrounds a server in one step and
  uses it in the *next* one — fragile. LHCI can start and stop the server
  itself.

### 16.3 The corrected workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/test
      REDIS_URL: redis://localhost:6379/0
      GITHUB_TOKEN: ci-dummy-token-not-used-by-tests
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: backend/requirements.txt
      - run: pip install -r requirements.txt
      - run: alembic upgrade head
      - run: pytest -v

  frontend-build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npx eslint .
      - run: npm run build          # `tsc -b && vite build` — typecheck is included
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: frontend/dist

  lighthouse:
    needs: frontend-build
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: frontend/dist
      - run: npx lhci autorun
```

`GITHUB_TOKEN` as a job-level env var shadows the automatic Actions token
inside that job. Harmless here (nothing in `backend-test` calls the GitHub
API), but if you later add a step that needs the real one, rename this to
something like `GH_PAT` and map it in `config.py`.

`npm ci` needs `@neelamkhan21/ui` to be a **public** npm package. If you
ever make it private, CI needs an `NODE_AUTH_TOKEN` secret and a
`registry-url` on `setup-node`.

### 16.4 `frontend/lighthouserc.json`

This is what replaces the original's `|| true`. Start with thresholds you
actually pass today, then ratchet:

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "npx vite preview --port 4173",
      "url": ["http://localhost:4173/login"],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 300 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

Note the URL is `/login` — see 15.3. `vite preview` serves the SPA fallback
correctly, which `serve dist` does not do by default for client-side routes.
Accessibility is an `error` (you have a component library with an a11y gate;
hold the app to the same bar); performance stays a `warn` until the LCP work
in `PERFORMANCE.md`'s next-steps list is done, then promote it.

Add `frontend/.lighthouseci/` and `.lighthouseci/` to `.gitignore` — both
directories exist in your working tree right now and shouldn't be committed.

---

## PART 17 — AWS account setup

Unchanged if you're reusing the account from the component library project.
**One addition that changes Part 19's math:**

AWS replaced the classic free tier in July 2025. Accounts created **before**
then keep the familiar 12-months-of-750-hours model. Accounts created
**after** get a credit-based free plan instead (a starting credit balance
plus a 6-month window), and some services no longer have a perpetual
always-free allowance. Check **Billing and Cost Management → Free tier**
before you assume anything in Part 19 applies to you.

Either way: **set the zero-spend budget alert first, before creating a
single resource.** That advice is unchanged and is the one step you should
never skip.

---

## PART 18 — AWS deployment with k3s

### 18.0 The change auth forces (read this before touching the console)

The original plan was: frontend on CloudFront (HTTPS), API at
`http://EC2_PUBLIC_IP:30080`, and `VITE_API_URL` pointed at that IP. **That
cannot work now**, for three independent reasons — none of them stylistic:

1. **Mixed content.** An HTTPS CloudFront page cannot `fetch()` a plain HTTP
   origin. Browsers block it outright; you'd get zero requests, not slow
   ones.
2. **Third-party cookies.** `services/auth.py` authenticates with an
   httpOnly `session` cookie. A CloudFront page calling a different origin
   makes that cookie cross-site, which requires `SameSite=None; Secure` —
   and `Secure` requires HTTPS on the API, which you don't have on a raw
   NodePort. Your config defaults (`COOKIE_SECURE=false`,
   `COOKIE_SAMESITE=lax`) are correct for local dev and wrong for that
   deployment.
3. **Even with `SameSite=None`, browsers are actively phasing out
   third-party cookies.** Designing a new deployment around one in 2026 is
   building on sand.

**The fix — one CloudFront distribution with two origins.** The frontend and
the API share an origin from the browser's point of view, so the session
cookie is first-party, `SameSite=Lax` keeps working, and there's no mixed
content anywhere:

```
                     ┌──────────── CloudFront (HTTPS) ────────────┐
browser ──HTTPS────▶ │  default behavior  /*      → S3 (dist/)     │
                     │  behavior          /api/*  → EC2:30080      │
                     │  behavior          /health → EC2:30080      │
                     └────────────────────────────────────────────┘
                                    │
                          EC2 (k3s) ─┴─▶ api / worker / beat pods
                                          │
                                    RDS + ElastiCache (private subnets)
```

`VITE_API_URL` becomes `/api` — a relative path — and CORS becomes almost
moot (keep it configured correctly anyway; OAuth redirects still care).

**The tradeoff to state in your README:** the CloudFront→EC2 leg is plain
HTTP over the public internet. For a portfolio project with public GitHub
data that's an acceptable, *named* tradeoff. The upgrade path is a real
domain (or a free DuckDNS subdomain) plus Caddy on the instance for
automatic Let's Encrypt TLS, then switching the origin protocol policy to
HTTPS-only. Worth a sentence; not worth blocking on.

**Ordering matters now.** The CloudFront domain must exist before you can
register OAuth callbacks or build the frontend, so the sequence is:
RDS/ElastiCache → EC2 + k3s → S3 + CloudFront (get the domain) → OAuth apps
→ Secret/ConfigMap → deploy → build and upload the frontend.

### 18.1 RDS (managed Postgres)

Mostly as originally written, with three corrections:

- **Set an initial database name.** Under *Additional configuration* →
  *Initial database name*, enter `oss_dashboard`. RDS creates **no**
  database by default beyond the internal `postgres` one — skip this and
  your `DATABASE_URL` (which ends `/oss_dashboard`) fails to connect, with a
  confusing error, after everything else is already built.
- **Free tier template** may not appear on the newer credit-based free plan
  (Part 17). If it doesn't, pick `db.t4g.micro`, 20 GB gp3, single-AZ
  manually, and check the estimate against your credits.
- **Note the Availability Zone** it lands in, and put EC2 and ElastiCache in
  the same one — cross-AZ traffic is billable and pointless here.

Public access: **No**, as originally written. Correct.

### 18.2 ElastiCache — and a change in what Redis is *for*

The original said "managed Redis, free tier eligible." Two console traps and
one architectural note:

- **Do not accept the default "Serverless" deployment option.** It's the
  first thing the console offers and it has **no free tier** — it bills from
  the first minute. Choose *Design your own cache* → *Node based* →
  *Standalone*, node type `cache.t3.micro`.
- **Valkey vs. Redis OSS:** either works; `redis-py` (what `cache.py` uses)
  speaks both. Valkey nodes are cheaper post-free-tier.
- **Redis is no longer just a cache in this app.** It holds every login
  session (`session:{token}` → user id) *and* is Celery's broker and result
  backend. Consequences:
  - Leave `maxmemory-policy` alone (`noeviction`) — do **not** set
    `allkeys-lru`, which would evict live sessions and Celery messages under
    memory pressure and log people out at random.
  - A node restart or failover signs everyone out and drops queued sync
    jobs. Acceptable at this scale; say so in the README rather than
    discovering it later.
  - If you enable encryption in transit, `REDIS_URL` must use the
    `rediss://` scheme (two s's).

### 18.3 Security groups

Create the **EC2 security group first** (18.4), then come back and add
inbound rules referencing it — the original's "create RDS first, then figure
it out" ordering means you can't reference the SG by name yet:

- RDS SG: PostgreSQL/5432, source = the EC2 instance's security group.
- ElastiCache SG: Custom TCP/6379, source = the same EC2 security group.

Never source-by-IP here; the whole point of `Public access: No` is that only
the instance can reach these.

### 18.4 Launch the EC2 instance

As originally written, with three changes:

- **Storage: 30 GB gp3**, not 20. k3s, containerd's image store, the API
  image and its build layers add up faster than you'd think, and 30 GB is
  the free-tier EBS ceiling anyway — there's no reason to leave 10 GB on the
  table.
- **Port 30080 should not be open to the world.** Set its source to the AWS
  managed prefix list `com.amazonaws.global.cloudfront.origin-facing`, so
  only CloudFront can reach the API directly. Costs nothing, and it means
  nobody can bypass your CDN to hit the origin.
- **t3.micro has 1 GB of RAM**, and you're about to run a Kubernetes control
  plane plus three Python containers on it. Add swap immediately after first
  login, before anything gets OOM-killed:
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

### 18.5 Install k3s

One flag saves the whole kubeconfig permissions dance in the original, and
one saves ~100 MB of RAM you don't have to spare:

```bash
curl -sfL https://get.k3s.io | \
  INSTALL_K3S_EXEC="--write-kubeconfig-mode 644 --disable traefik" sh -
```

`--disable traefik` is right *because* you're exposing the API via NodePort
(18.6); if you later switch to an Ingress, reinstall without it. Keep
metrics-server enabled — the HPA stretch goal at the end of 18.6 needs it.

```bash
mkdir -p ~/.kube && cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
echo 'export KUBECONFIG=~/.kube/config' >> ~/.bashrc && source ~/.bashrc
kubectl get nodes      # one node, Ready
```

### 18.6 Build, push, and deploy

#### Build for the right CPU architecture

**This is the failure everyone hits on an Apple Silicon Mac.** `docker
build` produces an `arm64` image; a t3.micro is `x86_64`. The push succeeds,
the pod pulls fine, and then crash-loops with `exec format error`.

```bash
cd backend
docker buildx build --platform linux/amd64 \
  -t yourdockerhubuser/oss-dashboard-api:latest --push .
```

(`buildx --push` does build and push in one step; `docker login` first.)

#### Config and secrets — the original's list is wrong

There is **no `JWT_SECRET`** in this app. `services/auth.py` deliberately
uses opaque random tokens in Redis instead of signed JWTs, so there's
nothing to sign and nothing to leak. The real environment surface is
`config.py`'s `Settings` class. Split it — real secrets in a `Secret`,
plain config in a `ConfigMap`, both mounted with `envFrom`:

```yaml
# k8s/secret.yaml — DO NOT COMMIT (add k8s/secret.yaml to .gitignore first)
apiVersion: v1
kind: Secret
metadata:
  name: oss-dashboard-secrets
type: Opaque
stringData:
  DATABASE_URL: "postgresql://oss_dashboard:PASSWORD@YOUR_RDS_ENDPOINT:5432/oss_dashboard"
  REDIS_URL: "redis://YOUR_ELASTICACHE_ENDPOINT:6379/0"
  GITHUB_TOKEN: "ghp_the_sync_workers_own_PAT"
  GITHUB_CLIENT_ID: "Ov23li..."
  GITHUB_CLIENT_SECRET: "..."
  GOOGLE_CLIENT_ID: "....apps.googleusercontent.com"
  GOOGLE_CLIENT_SECRET: "GOCSPX-..."
---
# k8s/configmap.yaml — safe to commit
apiVersion: v1
kind: ConfigMap
metadata:
  name: oss-dashboard-config
data:
  FRONTEND_URL: "https://dXXXXXXXX.cloudfront.net"
  API_BASE_URL: "https://dXXXXXXXX.cloudfront.net"
  COOKIE_SECURE: "true"
  COOKIE_SAMESITE: "lax"
```

Three things to get right here:

- `COOKIE_SECURE: "true"` — mandatory. The cookie must never be sent over
  plain HTTP in production.
- `COOKIE_SAMESITE: "lax"` — correct *because* of the unified CloudFront
  origin in 18.0. If you ever split the API onto its own domain, this has to
  become `none` **and** the API needs its own TLS.
- `API_BASE_URL` is what `services/oauth.py` builds provider redirect URIs
  from (`{api_base_url}/api/auth/{provider}/callback`), and `FRONTEND_URL` is
  where `routers/auth.py` sends the browser after a successful round trip.
  Both must be the CloudFront domain, and both must match what you register
  with GitHub and Google **exactly**.
- `POSTGRES_USER`/`PASSWORD`/`DB` from your local `.env` are **not** needed
  here — those configured the local Postgres *container*. RDS handles that.

#### Deployments

Same three-Deployment shape as the original, plus the things that matter on
a 1 GB node and with a mutable `:latest` tag:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 1
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      containers:
        - name: api
          image: yourdockerhubuser/oss-dashboard-api:latest
          imagePullPolicy: Always        # without this, `rollout restart` reuses the cached :latest
          command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
          ports: [{ containerPort: 8000 }]
          envFrom:
            - secretRef: { name: oss-dashboard-secrets }
            - configMapRef: { name: oss-dashboard-config }
          resources:
            requests: { memory: "192Mi", cpu: "100m" }
            limits:   { memory: "384Mi" }
          readinessProbe:
            httpGet: { path: /health, port: 8000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /health, port: 8000 }
            initialDelaySeconds: 30
            periodSeconds: 20
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
spec:
  replicas: 1
  selector:
    matchLabels: { app: worker }
  template:
    metadata:
      labels: { app: worker }
    spec:
      containers:
        - name: worker
          image: yourdockerhubuser/oss-dashboard-api:latest
          imagePullPolicy: Always
          command: ["celery", "-A", "app.services.celery_app", "worker",
                    "--loglevel=info", "--concurrency=2"]
          envFrom:
            - secretRef: { name: oss-dashboard-secrets }
            - configMapRef: { name: oss-dashboard-config }
          resources:
            requests: { memory: "192Mi", cpu: "100m" }
            limits:   { memory: "384Mi" }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: beat
spec:
  replicas: 1   # must stay 1 — >1 beat replica double-fires every scheduled sync
  selector:
    matchLabels: { app: beat }
  template:
    metadata:
      labels: { app: beat }
    spec:
      containers:
        - name: beat
          image: yourdockerhubuser/oss-dashboard-api:latest
          imagePullPolicy: Always
          command: ["celery", "-A", "app.services.celery_app", "beat", "--loglevel=info"]
          envFrom:
            - secretRef: { name: oss-dashboard-secrets }
            - configMapRef: { name: oss-dashboard-config }
          resources:
            requests: { memory: "96Mi", cpu: "50m" }
            limits:   { memory: "192Mi" }
---
apiVersion: v1
kind: Service
metadata:
  name: api-service
spec:
  type: NodePort
  selector: { app: api }
  ports:
    - port: 8000
      targetPort: 8000
      nodePort: 30080
```

`--concurrency=2` on the worker matters: Celery defaults to one process per
CPU core and each one is a full Python interpreter with SQLAlchemy loaded.
On a 1 GB box, the default will OOM you.

The `readinessProbe` is the concrete answer to a real bug already in
`PERFORMANCE.md`: the api container crash-looped for 26 hours while looking
"Up" in `docker ps`. Kubernetes wouldn't have routed traffic to it, and
`kubectl get pods` would have said `0/1 Running` immediately. Worth
mentioning in the README — it's a genuine "why Kubernetes over Compose"
answer drawn from your own project rather than a textbook.

#### Migrations — as a Job, not `kubectl run`

The original's `kubectl run --env-from=secretRef:...` **isn't a real
flag** — `kubectl run` has no `--env-from`. Use a Job:

```yaml
# k8s/migrate-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate
spec:
  backoffLimit: 1
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: yourdockerhubuser/oss-dashboard-api:latest
          imagePullPolicy: Always
          command: ["alembic", "upgrade", "head"]
          envFrom:
            - secretRef: { name: oss-dashboard-secrets }
            - configMapRef: { name: oss-dashboard-config }
```

```bash
kubectl apply -f secret.yaml -f configmap.yaml
kubectl apply -f migrate-job.yaml
kubectl wait --for=condition=complete job/migrate --timeout=120s
kubectl logs job/migrate
kubectl delete job migrate     # so the next `apply` can recreate it
kubectl apply -f deployment.yaml
kubectl get pods               # api / worker / beat, all Running
curl http://localhost:30080/health
```

The scaling demo and the HPA stretch goal from the original both still
apply and both still work — just remember that on a 1 GB node,
`--replicas=3` on the worker is a demo you scale back down, not a resting
state. `kubectl top pods` before and after is a nice thing to screenshot.

### 18.7 Frontend — S3 + CloudFront (revised)

```bash
aws s3 mb s3://yourname-oss-dashboard-frontend --region us-east-1
```

Create the distribution with **two origins**:

1. **S3 origin** (`yourname-oss-dashboard-frontend`), OAC enabled, bucket
   public access blocked. Default behavior → this origin, Redirect HTTP to
   HTTPS, `Managed-CachingOptimized`.
2. **Custom origin**: your EC2 instance's public DNS, **Protocol: HTTP
   only**, **HTTP port: 30080** (CloudFront permits custom ports in the
   1024–65535 range, so the NodePort works directly).

Add two behaviors pointing at the EC2 origin — `/api/*` and `/health`:

- Viewer protocol policy: **Redirect HTTP to HTTPS**
- Allowed methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE** (the app
  uses PATCH and DELETE for pin/remove/unwatch — the default GET/HEAD-only
  setting silently breaks them)
- Cache policy: **`Managed-CachingDisabled`**
- Origin request policy: **`Managed-AllViewerExceptHostHeader`** (this is
  what forwards the session cookie to the origin — without it, every request
  arrives unauthenticated)

Then two settings the original guide only half-covered:

- **Default root object: `index.html`** — set it during creation, as the
  original correctly insists.
- **SPA fallback (new, and required):** the app uses `BrowserRouter` with
  `/compare` and `/repos/:repoId` routes. A hard refresh on those asks S3
  for a key that doesn't exist. Under **Error pages**, add two custom error
  responses: **403 → `/index.html`, 200** and **404 → `/index.html`, 200**.
  Without these, every deep link and every page reload returns S3's XML
  error document.

Build and upload — note `VITE_API_URL` is now a **relative path**:

```bash
cd frontend
echo 'VITE_API_URL=/api' > .env.production
npm run build
aws s3 sync dist/ s3://yourname-oss-dashboard-frontend --delete
aws cloudfront create-invalidation --distribution-id EXXXXXXXXXXXXX --paths '/*'
```

The invalidation is not optional and wasn't in the original: `index.html`
references hashed chunk filenames, so without it CloudFront serves the old
HTML pointing at chunks you just deleted, and the app white-screens for
anyone with a warm cache.

### 18.8 OAuth apps and CORS

Register **new** OAuth applications for production (don't reuse the
localhost ones — a single GitHub OAuth app takes one callback URL):

- GitHub → Settings → Developer settings → OAuth Apps → New:
  - Homepage: `https://dXXXXXXXX.cloudfront.net`
  - Authorization callback URL:
    `https://dXXXXXXXX.cloudfront.net/api/auth/github/callback`
- Google Cloud Console → Credentials → OAuth client ID:
  - Authorized JavaScript origin: `https://dXXXXXXXX.cloudfront.net`
  - Authorized redirect URI:
    `https://dXXXXXXXX.cloudfront.net/api/auth/google/callback`

Put those new client IDs/secrets in `k8s/secret.yaml`.

CORS itself needs **no code change** — `main.py` already reads
`allow_origins=[settings.frontend_url]` with `allow_credentials=True`, so
setting `FRONTEND_URL` in the ConfigMap is the whole job. (That's the
`allow_origins=["*"]` trap already avoided: it's illegal with credentialed
requests, and browsers reject the pairing outright.)

Redeploying after any change:

```bash
# locally
docker buildx build --platform linux/amd64 \
  -t yourdockerhubuser/oss-dashboard-api:latest --push backend/

# on the instance
kubectl rollout restart deployment/api deployment/worker deployment/beat
kubectl rollout status deployment/api
```

This works *because* of `imagePullPolicy: Always`. A more rigorous
alternative, worth knowing: tag images with the git SHA instead of `latest`
and `kubectl set image deployment/api api=...:$SHA` — then rollbacks
(`kubectl rollout undo`) actually mean something, which they don't when
every revision points at the same mutable tag.

### 18.9 Post-deploy checklist

Auth touches enough moving parts that "the health check returns ok" no
longer means it works. Verify in this order:

1. `curl https://dXXXX.cloudfront.net/health` → `{"status":"ok"}` (proves
   the `/health` behavior and the EC2 origin).
2. Load the site, sign up with email + password, refresh the page. If the
   session survives the refresh, cookies are configured correctly — this is
   the single most likely thing to be broken.
3. "Continue with GitHub" and "Continue with Google", end to end. Failures
   here are almost always a callback URL that doesn't match `API_BASE_URL`
   character for character.
4. Add a repo, then `kubectl logs deployment/worker -f` and watch the sync
   run. Then confirm beat fires on its own at the next :00/:15/:30/:45.
5. Hard-refresh on `/compare` — proves the SPA fallback (18.7).
6. The Watch button: `PUT /user/subscriptions` needs the **`repo`** scope,
   not just `public_repo`. If your production `GITHUB_TOKEN` only has
   `public_repo`, watching returns 403 and the UI surfaces it as
   *"GITHUB_TOKEN doesn't have permission…"*. Either widen the scope or
   accept it as a known gap.

---

## PART 19 — Cost recap

| Service | Free tier | Notes |
|---|---|---|
| EC2 t3.micro | 750 hrs/month, 12 months | k3s control plane + node; api/worker/beat pods |
| EBS 30 GB gp3 | 30 GB, 12 months | 18.4 uses the full allowance |
| k3s | Always free | Open-source software, no AWS billing relationship |
| Docker Hub | Free, unlimited public repos | Stores the API image |
| RDS db.t3/t4g.micro | 750 hrs/month, 12 months | Single-AZ, 20 GB |
| ElastiCache cache.t3.micro | 750 hrs/month, 12 months | **Node-based only** — Serverless has no free tier |
| S3 + CloudFront | 12-month allowances; CloudFront has a perpetual 1 TB/month tier | Frontend + API proxy |
| GitHub Actions | Free for public repos | CI |
| GitHub API | 5,000 req/hr authenticated | Free, no AWS cost |

**Caveat that outranks the whole table:** everything above assumes the
classic 12-month free tier. If your account was created after July 2025 you
are on the newer credit-based plan (Part 17) and this is *credit spend*, not
$0. Check the Free tier page and keep the budget alert on either way.

Deliberately avoided, and worth naming in the README as decisions rather
than omissions:

- **EKS** — $0.10/hr (~$73/month) for the managed control plane alone, no
  free tier, at any cluster size.
- **ECS Fargate** — no free tier; per vCPU/GB-hour from minute one.
- **ALB** — worth calling out because it's the "obvious" way to get HTTPS in
  front of EC2: ~$16–20/month baseline, no free tier. The two-origin
  CloudFront setup in 18.0 gets you TLS, a CDN, *and* same-origin cookies
  for nothing, which is why it's the recommendation here.
- **NAT Gateway** — ~$32/month plus data processing. You don't need one:
  the instance sits in a public subnet with a public IP, and RDS and
  ElastiCache are reached over private VPC addresses.

Two things that will cost a little even inside the free tier: cross-AZ
traffic if EC2, RDS and ElastiCache end up in different AZs (put them
together — 18.1), and an Elastic IP if you allocate one and leave it
unattached.
