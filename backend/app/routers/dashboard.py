# backend/app/routers/dashboard.py
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.services.db import get_db
from app.services.cache import cache_get, cache_set
from app.models.models import Contributor, Repo, PullRequest

router = APIRouter()

@router.get("/repos/{repo_id}/stats-naive")
def repo_stats_naive(repo_id: int, db: Session = Depends(get_db)):
    repo = db.query(Repo).filter_by(id=repo_id).first()

    # N+1: this triggers a separate lazy-loaded query for EVERY pull request
    # accessed via repo.pull_requests, and we're computing the average in
    # Python instead of letting the database do it.
    merge_times = []
    for pr in repo.pull_requests:
        if pr.merged_at and pr.created_at:
            merge_times.append((pr.merged_at - pr.created_at).total_seconds())

    avg_merge_seconds = sum(merge_times) / len(merge_times) if merge_times else 0

    return {
        "repo": repo.full_name,
        "avg_merge_time_hours": round(avg_merge_seconds / 3600, 1),
        "total_prs": len(repo.pull_requests),
    }

@router.get("/repos/{repo_id}/stats")
def repo_stats_optimized(repo_id: int, db: Session = Depends(get_db)):
    cache_key = f"repo_stats:{repo_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    repo = db.query(Repo).filter_by(id=repo_id).first()

    result = (
        db.query(
            func.avg(
                func.extract("epoch", PullRequest.merged_at - PullRequest.created_at)
            ).label("avg_seconds"),
            func.count(PullRequest.id).label("total"),
        )
        .filter(PullRequest.repo_id == repo_id, PullRequest.merged_at.isnot(None))
        .first()
    )

    # func.avg(func.extract(...)) comes back from Postgres as a Decimal, not a
    # float — round() preserves that (Decimal in, Decimal out), and Decimal
    # isn't JSON-serializable by the stdlib `json` module cache_set uses (only
    # FastAPI's own response encoder knows how to coerce it). Cast to float
    # before doing arithmetic on it, so the value is a plain float everywhere
    # downstream, not just in the uncached path.
    avg_seconds = float(result.avg_seconds) if result.avg_seconds is not None else 0.0
    response = {
        "repo": repo.full_name,
        "avg_merge_time_hours": round(avg_seconds / 3600, 1),
        "total_prs": result.total,
    }
    cache_set(cache_key, response, ttl_seconds=900)  # 15 min, matches sync frequency
    return response

@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    repos = db.query(Repo).all()
    # Start naive here too — one query per repo for its stats — then apply
    # the same eager-loading + SQL-aggregation fix from Part 11 once this
    # is working end to end. Deltas (vs. last period) and sparkline series
    # need a second query per metric comparing two date windows — build
    # that once the base numbers are flowing to the UI correctly.
    # StatCard's `delta` prop is a signed ratio (number), and `trend` is the
    # sparkline series (number[]) — keep the stub's shape matching those
    # types exactly (0 / [], not "" / "neutral") so the real aggregation
    # dropped in later doesn't also have to fix a type mismatch in the UI.
    return {
        "repos": [{"fullName": r.full_name, "avgMergeHours": 0, "openIssues": 0, "contributors": 0} for r in repos],
        "avgMergeTime": {"value": "—", "delta": 0, "sparkline": []},
        "openIssues": {"value": "—", "delta": 0, "sparkline": []},
        "contributors": {"value": "—", "delta": 0, "sparkline": []},
        "prsThisWeek": {"value": "—", "delta": 0, "sparkline": []},
        "trend": {"months": [], "series": []},
    }
    
@router.get("/repos/{repo_id}/contributors")
def repo_contributors(repo_id: int, db: Session = Depends(get_db)):
    contributors = db.query(Contributor).filter_by(repo_id=repo_id).order_by(Contributor.contributions.desc()).all()
    return [{"username": c.username, "avatarUrl": c.avatar_url, "contributions": c.contributions} for c in contributors]