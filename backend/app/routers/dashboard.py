# backend/app/routers/dashboard.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.services.db import get_db
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
    
@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    repos = db.query(Repo).all()
    # Start naive here too — one query per repo for its stats — then apply
    # the same eager-loading + SQL-aggregation fix from Part 11 once this
    # is working end to end. Deltas (vs. last period) and sparkline series
    # need a second query per metric comparing two date windows — build
    # that once the base numbers are flowing to the UI correctly.
    return {
        "repos": [{"fullName": r.full_name, "avgMergeHours": 0, "openIssues": 0, "contributors": 0} for r in repos],
        "avgMergeTime": {"value": "—", "delta": "", "trend": "neutral", "sparkline": []},
        "openIssues": {"value": "—", "delta": "", "trend": "neutral", "sparkline": []},
        "contributors": {"value": "—", "delta": "", "trend": "neutral", "sparkline": []},
        "prsThisWeek": {"value": "—", "delta": "", "trend": "neutral", "sparkline": []},
        "trend": {"months": [], "series": []},
    }
    
@router.get("/repos/{repo_id}/contributors")
def repo_contributors(repo_id: int, db: Session = Depends(get_db)):
    contributors = db.query(Contributor).filter_by(repo_id=repo_id).order_by(Contributor.contributions.desc()).all()
    return [{"username": c.username, "avatarUrl": c.avatar_url, "contributions": c.contributions} for c in contributors]