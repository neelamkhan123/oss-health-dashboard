import hashlib
import httpx
import datetime
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from app.config import settings
from app.models.models import Repo, PullRequest, Issue, Contributor
from app.services.celery_app import celery_app
from app.services.cache import cache_get, cache_set, r

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)

TRACKED_REPOS = ["facebook/react", "vuejs/core", "microsoft/vscode"]  # curated list, see Part 0 discussion
GITHUB_API = "https://api.github.com"
HEADERS = {"Authorization": f"Bearer {settings.github_token}", "Accept": "application/vnd.github+json"}

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
            _sync_pull_requests(client, db, repo, since)
            _sync_issues(client, db, repo, since)
            _sync_contributors(client, db, repo)

        repo.last_synced_at = datetime.datetime.utcnow()
        db.commit()
        r.delete(f"repo_stats:{repo.id}")
    finally:
        db.close()

def _cached_github_get(client, url, params):
    cache_key = "gh:" + hashlib.sha256(f"{url}{params}".encode()).hexdigest()
    cached = cache_get(cache_key)
    if cached:
        return cached
    resp = client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()
    cache_set(cache_key, data, ttl_seconds=300)
    return data

def _sync_pull_requests(client, db, repo, since):
    owner, name = repo.full_name.split("/")
    data = _cached_github_get(
        client,
        f"{GITHUB_API}/repos/{owner}/{name}/pulls",
        {"state": "all", "sort": "updated", "direction": "desc", "per_page": 100},
    )
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
    db.commit()

def _sync_issues(client, db, repo, since):
    owner, name = repo.full_name.split("/")
    data = _cached_github_get(
        client,
        f"{GITHUB_API}/repos/{owner}/{name}/issues",
        {"state": "all", "since": since, "per_page": 100},
    )
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
    db.commit()

def _sync_contributors(client, db, repo):
    owner, name = repo.full_name.split("/")
    data = _cached_github_get(
        client,
        f"{GITHUB_API}/repos/{owner}/{name}/contributors",
        {"per_page": 100},
    )
    for c in data:
        existing = db.query(Contributor).filter_by(repo_id=repo.id, username=c["login"]).first()
        if not existing:
            existing = Contributor(repo_id=repo.id, username=c["login"])
            db.add(existing)
        existing.avatar_url = c["avatar_url"]
        existing.contributions = c["contributions"]
    db.commit()