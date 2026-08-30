import hashlib
import httpx
import datetime
import json
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.config import settings
from app.models.models import Repo, TrackedRepo, PullRequest, Issue, Contributor, Commit
from app.services.celery_app import celery_app
from app.services.cache import cache_get, cache_set, cache_delete_prefix, r

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)

# Two jobs: the bootstrap seed for a brand-new database with no Repo rows at
# all yet (see sync_all_repos below — once anything exists in the repos
# table, whether from this seed or "Add repository" in the UI, that table
# is the source of truth for what's *synced*), and the starter set every
# new account gets tracked on automatically (see track_default_repos below)
# so a fresh signup lands on a populated Overview instead of an empty one.
TRACKED_REPOS = ["facebook/react", "vuejs/core", "microsoft/vscode"]
GITHUB_API = "https://api.github.com"
HEADERS = {"Authorization": f"Bearer {settings.github_token}", "Accept": "application/vnd.github+json"}

# Per-run caps on the two rate-limit-heavy lookups (issue first-response,
# PR reviews) — both need one extra GitHub call per row, so a repo with a
# large backlog would otherwise burn through the 5,000/hr budget on its
# first sync. Bounding them means a fresh repo fills in gradually over
# several sync cycles instead of trying to do it all at once; every
# subsequent run only has to cover what's newly missing.
ISSUE_FIRST_RESPONSE_CAP = 30
PR_REVIEW_FETCH_CAP = 20
# Commits are the highest-volume endpoint by far (a busy repo can have
# thousands in a year) — capped independently and scoped to the last 12
# months (matches the heatmap's own window), not "since last sync", on a
# repo's first sync so the heatmap isn't empty on day one.
COMMIT_MAX_PAGES = 20

# ── sync status, for the "Sync now" button to poll ──────────────────────
#
# Plain Redis keys, not the cache_get/cache_set JSON-blob helpers above:
# those are for *cached computed results* with one owner (a single request
# writes, later requests read); this is *live process state* that multiple
# concurrent Celery tasks write to as they each finish. One key per repo
# (rather than one JSON blob covering all of them) is what keeps concurrent
# completions safe without a lock: two tasks finishing at the same instant
# each SET their own key, so neither can race the other into overwriting a
# stale copy of the whole status — a single shared blob updated via
# read-modify-write couldn't make that guarantee.
SYNC_STARTED_KEY = "sync:started_at"
# The exact set of repos *this run* covers, as a JSON array — read back by
# get_sync_status/cancel_sync instead of re-querying "every tracked repo"
# at read time, which could have changed (a repo added mid-run) between
# when the batch was queued and when its status is checked.
SYNC_REPOS_KEY = "sync:repos"
SYNC_REPO_KEY_PREFIX = "sync:repo:"
# Per-repo Celery task id, so a Stop click can revoke exactly the tasks
# this run queued — not any unrelated sync_one_repo call.
SYNC_TASK_KEY_PREFIX = "sync:task:"
# Long enough to cover a slow multi-repo sync (a few minutes per repo, per
# the docstring below); short enough that a crashed worker doesn't leave
# the status endpoint reporting "running" forever.
SYNC_STATUS_TTL = 3600

def _repo_sync_key(full_name: str) -> str:
    return f"{SYNC_REPO_KEY_PREFIX}{full_name}"

def _repo_task_key(full_name: str) -> str:
    return f"{SYNC_TASK_KEY_PREFIX}{full_name}"

def _current_run_repos() -> list[str]:
    raw = r.get(SYNC_REPOS_KEY)
    return json.loads(raw) if raw else []

def get_sync_status() -> dict:
    """Read by GET /api/dashboard/sync/status — see its own docstring."""
    started_at = r.get(SYNC_STARTED_KEY)
    if started_at is None:
        return {"state": "idle", "startedAt": None, "repos": {}}
    repos = {}
    for full_name in _current_run_repos():
        raw = r.get(_repo_sync_key(full_name))
        repos[full_name] = raw.decode() if raw else "unknown"
    # "cancelled" is terminal, same as "done"/"failed" — only "pending"
    # means the batch is still running.
    state = "running" if any(status == "pending" for status in repos.values()) else "complete"
    return {"state": state, "startedAt": started_at.decode(), "repos": repos}

def cancel_sync() -> dict:
    """Called by POST /api/dashboard/sync/stop. Revokes every repo in the
    current run that's still "pending" — `terminate=True` SIGTERMs one
    already running (the default prefork worker pool respawns the killed
    child automatically); one still sitting in the queue is simply never
    handed to a worker. Either way the status flips to "cancelled" *before*
    the revoke call goes out, not after, so the status endpoint is correct
    immediately rather than racing the signal.

    A task killed mid-write can leave a repo's sync partially applied —
    e.g. contributors updated but PRs not yet — since sync_one_repo commits
    incrementally per section rather than in one transaction. That's an
    accepted tradeoff of an abrupt stop: the next sync fills in whatever
    was missed, the same way an interrupted incremental sync always would.
    """
    cancelled = []
    for full_name in _current_run_repos():
        raw_status = r.get(_repo_sync_key(full_name))
        if (raw_status.decode() if raw_status else None) != "pending":
            continue
        r.set(_repo_sync_key(full_name), "cancelled", ex=SYNC_STATUS_TTL)
        raw_task_id = r.get(_repo_task_key(full_name))
        if raw_task_id:
            celery_app.control.revoke(raw_task_id.decode(), terminate=True, signal="SIGTERM")
        cancelled.append(full_name)
    return {"cancelled": cancelled}

def track_default_repos(db: Session, user_id: int) -> None:
    """Called once, right after a new User row is created (routers/auth.py's
    signup, and services/oauth.py's upsert_oauth_user for a first-time OAuth
    signup) — links the new account to the same TRACKED_REPOS starter set a
    brand-new database seeds itself with, so a fresh signup lands on a
    populated Overview instead of OverviewEmpty's empty state.

    Reuses whichever Repo rows already exist — the common case once anyone,
    ever, has tracked one of these — rather than re-verifying them against
    GitHub. For one truly nobody has (a brand-new deployment, first user
    ever), creates a bare row exactly the way sync_one_repo itself does for
    a repo it's never seen, and queues that same task to fill it in; no
    special-cased shortcut that skips the normal sync pipeline.

    Doesn't commit — part of the caller's own transaction, so a failure
    partway through (a repo insert, say) rolls the new user back too rather
    than leaving a half-onboarded account."""
    for full_name in TRACKED_REPOS:
        repo = db.query(Repo).filter_by(full_name=full_name).first()
        if repo is None:
            repo = Repo(full_name=full_name)
            db.add(repo)
            db.flush()  # assigns repo.id without ending the transaction
            sync_one_repo.delay(full_name)
        db.add(TrackedRepo(user_id=user_id, repo_id=repo.id))

@celery_app.task
def sync_all_repos():
    """Syncs every repo currently in the `repos` table — not a fixed list.
    Adding a repo through the UI (POST /api/dashboard/repos) inserts a row
    there directly, so it's picked up here on the very next run (whether
    the 15-minute beat schedule or a manual "Sync now") without needing
    its own separate code path. TRACKED_REPOS only seeds a database that
    has no rows at all yet."""
    db = SessionLocal()
    try:
        full_names = [row[0] for row in db.query(Repo.full_name).order_by(Repo.id).all()]
    finally:
        db.close()
    if not full_names:
        full_names = list(TRACKED_REPOS)

    r.set(SYNC_STARTED_KEY, datetime.datetime.utcnow().isoformat() + "Z", ex=SYNC_STATUS_TTL)
    r.set(SYNC_REPOS_KEY, json.dumps(full_names), ex=SYNC_STATUS_TTL)
    for full_name in full_names:
        r.set(_repo_sync_key(full_name), "pending", ex=SYNC_STATUS_TTL)
        result = sync_one_repo.delay(full_name)
        r.set(_repo_task_key(full_name), result.id, ex=SYNC_STATUS_TTL)

@celery_app.task
def sync_one_repo(full_name: str):
    db = SessionLocal()
    try:
        repo = db.query(Repo).filter_by(full_name=full_name).first()
        if not repo:
            repo = Repo(full_name=full_name)
            db.add(repo)
            db.commit()
            db.refresh(repo)

        # Incremental: only fetch PRs/issues updated since last sync
        since = repo.last_synced_at.isoformat() if repo.last_synced_at else "2020-01-01T00:00:00Z"

        with httpx.Client(headers=HEADERS, timeout=30, follow_redirects=True) as client:
            _sync_repo_meta(client, db, repo)
            # Contributors first: PRs/commits/reviews below only update a
            # Contributor row if one already exists for that username, so
            # the roster has to land before anything tries to attribute
            # activity to it.
            _sync_contributors(client, db, repo)
            touched_prs = _sync_pull_requests(client, db, repo, since)
            touched_issues = _sync_issues(client, db, repo, since)
            _sync_commits(client, db, repo, since if repo.last_synced_at else None)
            _sync_pr_reviews(client, db, repo, touched_prs[:PR_REVIEW_FETCH_CAP])
            _sync_issue_first_response(client, db, repo, touched_issues[:ISSUE_FIRST_RESPONSE_CAP])

        repo.last_synced_at = datetime.datetime.utcnow()
        db.commit()
        r.delete(f"repo_stats:{repo.id}")
        # /full and /overview are cached per `days` window now (the Topbar's
        # date-range picker), so one repo's sync can't name every variant by
        # exact key — and /overview's cache covers every tracked repo, so
        # any one of them syncing invalidates it.
        cache_delete_prefix(f"repo_full:{repo.id}:")
        cache_delete_prefix("overview:")
    except Exception:
        r.set(_repo_sync_key(full_name), "failed", ex=SYNC_STATUS_TTL)
        raise
    else:
        r.set(_repo_sync_key(full_name), "done", ex=SYNC_STATUS_TTL)
    finally:
        db.close()

def _cached_github_get(client, url, params):
    cache_key = "gh:" + hashlib.sha256(f"{url}{params}".encode()).hexdigest()
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    resp = client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()
    cache_set(cache_key, data, ttl_seconds=300)
    return data

def _paginate(client, url, params, max_pages=10):
    """GET every page of a GitHub list endpoint, stopping at the first
    short page (fewer items than per_page) or max_pages, whichever comes
    first. Each page is its own cache entry via _cached_github_get."""
    per_page = params.get("per_page", 30)
    items = []
    for page in range(1, max_pages + 1):
        batch = _cached_github_get(client, url, {**params, "page": page})
        if not batch:
            break
        items.extend(batch)
        if len(batch) < per_page:
            break
    return items

def _touch_contributor(db, repo_id, username, when, prs_merged_delta=0, reviews_delta=0):
    """Attributes one unit of activity to a contributor already known from
    the /contributors sync. Silently no-ops for a username with no matching
    row — someone active enough to author a PR/commit/review but absent
    from the top-100 contributors GitHub returns is a real but rare gap,
    not worth a second API surface to close."""
    if not username:
        return
    contributor = db.query(Contributor).filter_by(repo_id=repo_id, username=username).first()
    if not contributor:
        return
    if when and (contributor.last_active_at is None or when > contributor.last_active_at):
        contributor.last_active_at = when
    if prs_merged_delta:
        contributor.prs_merged = (contributor.prs_merged or 0) + prs_merged_delta
    if reviews_delta:
        contributor.reviews = (contributor.reviews or 0) + reviews_delta

def _parse_dt(value):
    if not value:
        return None
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)

def _sync_repo_meta(client, db, repo):
    owner, name = repo.full_name.split("/")
    data = _cached_github_get(client, f"{GITHUB_API}/repos/{owner}/{name}", {})
    repo.stars = data.get("stargazers_count")
    repo.forks = data.get("forks_count")
    repo.language = data.get("language")
    license_info = data.get("license") or {}
    repo.license = license_info.get("spdx_id") or license_info.get("name")

    # A separate endpoint from the repo fetch above: `language` there is
    # linguist's single guess at the repo's primary language, while this
    # returns bytes of code per language across the whole tree — what
    # GitHub's own "Languages" bar on the repo page is built from.
    repo.languages = _cached_github_get(
        client, f"{GITHUB_API}/repos/{owner}/{name}/languages", {}
    )
    db.commit()

def _sync_pull_requests(client, db, repo, since):
    owner, name = repo.full_name.split("/")
    data = _paginate(
        client,
        f"{GITHUB_API}/repos/{owner}/{name}/pulls",
        {"state": "all", "sort": "updated", "direction": "desc", "per_page": 100},
        max_pages=10,
    )
    touched = []
    for pr in data:
        existing = db.query(PullRequest).filter_by(
            repo_id=repo.id, github_pr_number=pr["number"]
        ).first()
        if not existing:
            existing = PullRequest(repo_id=repo.id, github_pr_number=pr["number"])
            db.add(existing)
        existing.title = pr["title"]
        existing.author = pr["user"]["login"]
        existing.created_at = pr["created_at"]
        existing.merged_at = pr.get("merged_at")
        existing.closed_at = pr.get("closed_at")
        touched.append(pr)

        if pr.get("merged_at"):
            _touch_contributor(
                db, repo.id, pr["user"]["login"], _parse_dt(pr["merged_at"]), prs_merged_delta=1
            )
    db.commit()
    return touched

def _sync_issues(client, db, repo, since):
    owner, name = repo.full_name.split("/")
    data = _paginate(
        client,
        f"{GITHUB_API}/repos/{owner}/{name}/issues",
        {"state": "all", "since": since, "per_page": 100},
        max_pages=10,
    )
    touched = []
    for issue in data:
        if "pull_request" in issue:
            continue  # GitHub's issues endpoint includes PRs; skip those
        existing = db.query(Issue).filter_by(
            repo_id=repo.id, github_issue_number=issue["number"]
        ).first()
        if not existing:
            existing = Issue(repo_id=repo.id, github_issue_number=issue["number"])
            db.add(existing)
        existing.title = issue["title"]
        existing.author = issue["user"]["login"]
        existing.created_at = issue["created_at"]
        existing.closed_at = issue.get("closed_at")
        existing.is_open = issue["state"] == "open"
        touched.append(existing)
    db.commit()
    return touched

def _sync_contributors(client, db, repo):
    owner, name = repo.full_name.split("/")
    data = _cached_github_get(
        client, f"{GITHUB_API}/repos/{owner}/{name}/contributors", {"per_page": 100}
    )
    for c in data:
        existing = db.query(Contributor).filter_by(repo_id=repo.id, username=c["login"]).first()
        if not existing:
            existing = Contributor(repo_id=repo.id, username=c["login"])
            db.add(existing)
        existing.avatar_url = c["avatar_url"]
        existing.contributions = c["contributions"]
    db.commit()

def _sync_commits(client, db, repo, since):
    owner, name = repo.full_name.split("/")
    window_start = since or (datetime.datetime.utcnow() - datetime.timedelta(days=365)).isoformat() + "Z"
    data = _paginate(
        client,
        f"{GITHUB_API}/repos/{owner}/{name}/commits",
        {"since": window_start, "per_page": 100},
        max_pages=COMMIT_MAX_PAGES,
    )
    for c in data:
        sha = c["sha"]
        existing = db.query(Commit).filter_by(repo_id=repo.id, sha=sha).first()
        if existing:
            continue  # commits are immutable — nothing to update on a repeat sync
        author_login = (c.get("author") or {}).get("login")  # None if the commit email isn't linked to a GitHub account
        authored_at = _parse_dt(c["commit"]["author"]["date"])
        db.add(Commit(repo_id=repo.id, sha=sha, author=author_login, authored_at=authored_at))
        if author_login:
            _touch_contributor(db, repo.id, author_login, authored_at)
    db.commit()

def _sync_pr_reviews(client, db, repo, prs):
    owner, name = repo.full_name.split("/")
    for pr in prs:
        reviews = _cached_github_get(
            client,
            f"{GITHUB_API}/repos/{owner}/{name}/pulls/{pr['number']}/reviews",
            {"per_page": 50},
        )
        for review in reviews:
            reviewer = (review.get("user") or {}).get("login")
            if not reviewer:
                continue
            _touch_contributor(
                db, repo.id, reviewer, _parse_dt(review.get("submitted_at")), reviews_delta=1
            )
    db.commit()

def _sync_issue_first_response(client, db, repo, issues):
    owner, name = repo.full_name.split("/")
    for issue in issues:
        if issue.first_response_at is not None:
            continue
        comments = _cached_github_get(
            client,
            f"{GITHUB_API}/repos/{owner}/{name}/issues/{issue.github_issue_number}/comments",
            # Ascending by creation is the endpoint's default — the first
            # few comments are enough to find one not from the OP without
            # paginating the whole thread. If none of these qualify (the
            # author's own follow-ups dominate the opening exchange), this
            # issue is left for a later run rather than paging further.
            {"per_page": 5},
        )
        # Heuristic: the first comment NOT from the issue's own author. A
        # cheap proxy for "first maintainer reply" — it's actually "first
        # reply from anyone else", which over-counts a quick "+1" from a
        # fellow reporter as a response. No cheaper signal exists without
        # a real notion of "maintainer" (e.g. cross-referencing repo
        # collaborators, its own extra API call this project doesn't make).
        for comment in comments:
            commenter = (comment.get("user") or {}).get("login")
            if commenter and commenter != issue.author:
                issue.first_response_at = _parse_dt(comment["created_at"])
                break
    db.commit()
