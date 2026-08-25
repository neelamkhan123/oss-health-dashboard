import hashlib
import httpx
import datetime
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from app.config import settings
from app.models.models import Repo, PullRequest, Issue, Contributor, Commit
from app.services.celery_app import celery_app
from app.services.cache import cache_get, cache_set, r

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)

TRACKED_REPOS = ["facebook/react", "vuejs/core", "microsoft/vscode"]  # curated list, see Part 0 discussion
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

@celery_app.task
def sync_all_repos():
    for full_name in TRACKED_REPOS:
        sync_one_repo.delay(full_name)

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
        r.delete(f"repo_full:{repo.id}")
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
