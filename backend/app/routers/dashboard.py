# backend/app/routers/dashboard.py
import re
import datetime
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, case, and_, within_group
from sqlalchemy.orm import Session
from app.services.auth import get_current_user
from app.services.db import get_db
from app.services.cache import cache_get, cache_set, cache_delete_prefix
from app.services.sync import sync_all_repos, sync_one_repo, get_sync_status, cancel_sync, GITHUB_API, HEADERS
from app.models.models import Contributor, Repo, TrackedRepo, User, PullRequest, Issue, Commit

router = APIRouter()

# GitHub's own rules are looser than this (usernames allow single internal
# hyphens up to 39 chars; repo names allow '.' '_' '-' up to 100), but this
# only needs to reject obvious junk before spending a GitHub API call on
# it — the call itself is the real validation.
REPO_FULL_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$")

# Bounds on the `days` query param the Topbar's date-range picker feeds into
# /overview and /full — 1 day minimum (a same-day window is still a valid,
# if noisy, selection), a year ceiling since nothing here is designed to
# aggregate further back than that (the 12-month trend charts already cap
# there independently of this parameter).
DaysParam = Query(90, ge=1, le=365)

def _median_hours(start_col, end_col):
    """A SQL expression for the median (not mean) of end_col - start_col, in
    hours. Real merge/first-response durations are heavily right-skewed — a
    handful of PRs or issues that sat for months pull the *mean* far above
    what almost every PR/issue actually experiences, which is exactly what
    real synced data showed: every tracked repo reading "Backlog growing"
    and month-to-month averages swinging 16h to 995h on a handful of
    outliers. The UI's own copy already says "median" throughout (matching
    the prototype) — this makes the number match its own label."""
    duration_hours = func.extract("epoch", end_col - start_col) / 3600.0
    return within_group(func.percentile_cont(0.5), duration_hours.asc())

# ── formatting helpers ──────────────────────────────────────────────────

def _format_count(n) -> str:
    """1043 -> '1,043'. Used for counts a reader wants exactly, not
    approximately — open issues, contributors, total commits."""
    if n is None:
        return "—"
    return f"{n:,}"

def _format_compact(n) -> str:
    """231000 -> '231k'. Used for counts nobody reads to the exact digit —
    stars, forks."""
    if n is None:
        return "—"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}m"
    if n >= 1_000:
        return f"{n / 1_000:.1f}k"
    return str(n)

def _format_duration(hours: float) -> str:
    """5.1 -> '5.1h'; 219.6 -> '9.2d'. Hours in, the unit that reads best
    out — matches the prototype's own '11h' / '2.1d' convention."""
    if hours < 24:
        return f"{round(hours, 1)}h"
    return f"{round(hours / 24, 1)}d"

def _relative(dt) -> str:
    """A DateTime -> '2h ago' / '3d ago', naive-UTC in, naive-UTC assumed."""
    if dt is None:
        return "—"
    delta = datetime.datetime.utcnow() - dt
    seconds = delta.total_seconds()
    if seconds < 3600:
        return f"{max(1, int(seconds // 60))}m ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)}h ago"
    return f"{int(seconds // 86400)}d ago"

MERGE_TIME_BUCKET_EDGES_HOURS = [1, 6, 24, 24 * 3, 24 * 7]  # <1h,1-6h,6-24h,1-3d,3-7d,>7d — 6 buckets

def _bucket_durations(hours_list):
    buckets = [0] * (len(MERGE_TIME_BUCKET_EDGES_HOURS) + 1)
    for h in hours_list:
        i = 0
        while i < len(MERGE_TIME_BUCKET_EDGES_HOURS) and h >= MERGE_TIME_BUCKET_EDGES_HOURS[i]:
            i += 1
        buckets[i] += 1
    return buckets

def _percentile(sorted_values, p):
    if not sorted_values:
        return None
    k = (len(sorted_values) - 1) * p
    f, c = int(k), min(int(k) + 1, len(sorted_values) - 1)
    if f == c:
        return sorted_values[f]
    return sorted_values[f] + (sorted_values[c] - sorted_values[f]) * (k - f)

def _month_boundaries(n=12):
    """The trailing n (label, start, end) month windows, oldest first —
    end is exclusive, so filtering >= start and < end covers the month."""
    today = datetime.datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    months = []
    cursor = today
    for _ in range(n):
        start = cursor
        end = (start.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
        months.append((start.strftime("%b"), start, end))
        cursor = (start - datetime.timedelta(days=1)).replace(day=1)
    months.reverse()
    return months

def _week_boundaries(n=12):
    """The trailing n (start, end) 7-day windows, oldest first, ending now."""
    now = datetime.datetime.utcnow()
    weeks = []
    for i in range(n, 0, -1):
        end = now - datetime.timedelta(weeks=i - 1)
        start = end - datetime.timedelta(weeks=1)
        weeks.append((start, end))
    return weeks

# ── repo lookup ──────────────────────────────────────────────────────────

def get_repo_or_404(db: Session, user_id: int, repo_full_name: str) -> Repo:
    """A repo, scoped to what *this user* tracks — not just any repo that
    happens to exist. Repo rows are shared (see TrackedRepo's docstring),
    but that sharing has to stop at the DB layer: without the join here,
    anyone signed in could read any repo's stats by guessing its full name,
    tracked or not. 404, not 403 — same reasoning as the existing message:
    it doesn't say whether the repo exists at all, only whether it shows up
    on your dashboard."""
    repo = (
        db.query(Repo)
        .join(TrackedRepo, TrackedRepo.repo_id == Repo.id)
        .filter(Repo.full_name == repo_full_name, TrackedRepo.user_id == user_id)
        .first()
    )
    if not repo:
        raise HTTPException(404, f"{repo_full_name} isn't tracked (or hasn't synced yet)")
    return repo

# ── shared computation: everything one repo's page (and one row of
#    Overview's table, and one card in Compare) needs, in one place so
#    those three surfaces can't drift from each other ──────────────────

def compute_repo_full(db: Session, repo: Repo, days: int = 90) -> dict:
    # The Topbar's date-range picker's window — everything below that
    # measures an *event* (a PR merging, an issue getting its first reply, a
    # commit landing) is scoped to it. Everything that measures *current
    # state* instead (open PRs, open issues, stars/forks/lang/license, the
    # 12-month trend charts and heatmap) stays unwindowed: an open PR from
    # eight months ago is still open today regardless of which trailing
    # window is selected, and a 12-month trend chart re-windowed to the
    # picker would mostly just go empty.
    window_start = datetime.datetime.utcnow() - datetime.timedelta(days=days)

    # PR totals: merged implies closed (GitHub sets both together), so
    # "open" is closed_at IS NULL and "closed, unmerged" is the rest. "open"
    # is a live count (unwindowed); merged/closed-unmerged are scoped to the
    # window so merge rate reflects PRs resolved in the selected period.
    pr_totals = (
        db.query(
            func.sum(
                case(
                    (and_(PullRequest.merged_at.isnot(None), PullRequest.merged_at >= window_start), 1),
                    else_=0,
                )
            ).label("merged"),
            func.sum(
                case(
                    (
                        and_(
                            PullRequest.closed_at.isnot(None),
                            PullRequest.merged_at.is_(None),
                            PullRequest.closed_at >= window_start,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("closed_unmerged"),
            func.sum(case((PullRequest.closed_at.is_(None), 1), else_=0)).label("open"),
        )
        .filter(PullRequest.repo_id == repo.id)
        .first()
    )
    resolved = (pr_totals.merged or 0) + (pr_totals.closed_unmerged or 0)
    merge_rate_pct = round((pr_totals.merged or 0) / resolved * 100) if resolved else 0

    # Merge-time durations, in hours — pulled once and reused for the
    # average, the histogram, and the percentiles rather than three
    # separate queries computing overlapping things. Scoped to PRs merged
    # within the window, same as merge_rate_pct above.
    duration_rows = (
        db.query(func.extract("epoch", PullRequest.merged_at - PullRequest.created_at))
        .filter(
            PullRequest.repo_id == repo.id,
            PullRequest.merged_at.isnot(None),
            PullRequest.merged_at >= window_start,
        )
        .all()
    )
    durations_hours = sorted(float(row[0]) / 3600 for row in duration_rows)
    # Median, not mean — see _median_hours' docstring. durations_hours is
    # already sorted, so computing it here in Python (rather than a second
    # SQL round trip) is free.
    avg_merge_hours = _percentile(durations_hours, 0.5) or 0.0
    dist = _bucket_durations(durations_hours)
    pct = [
        (label, _format_duration(_percentile(durations_hours, p)))
        for label, p in [("p50", 0.50), ("p75", 0.75), ("p90", 0.90), ("p95", 0.95)]
        if durations_hours
    ] or [(label, "—") for label in ("p50", "p75", "p90", "p95")]

    # Live counts, unwindowed — see the docstring above.
    open_issues = db.query(func.count(Issue.id)).filter(Issue.repo_id == repo.id, Issue.is_open.is_(True)).scalar()

    # "Contributors, {days} days" (the label both Overview and Compare give
    # this field) means contributors *active* in the window, not the size of
    # the all-time roster — same definition the overview KPI's
    # _active_contributors_between already uses, just for one repo. Reviews
    # aren't included: they're stored as a running total on Contributor, not
    # as dated events, so there's no timestamp here to window against.
    pr_authors_in_window = (
        db.query(PullRequest.author)
        .filter(PullRequest.repo_id == repo.id, PullRequest.created_at >= window_start)
        .distinct()
    )
    commit_authors_in_window = (
        db.query(Commit.author)
        .filter(Commit.repo_id == repo.id, Commit.authored_at >= window_start, Commit.author.isnot(None))
        .distinct()
    )
    contributors_count = len(
        {row[0] for row in pr_authors_in_window} | {row[0] for row in commit_authors_in_window}
    )

    # Issue first-response duration, in hours — same shape of query as
    # merge time, over whatever slice of issues _sync_issue_first_response
    # has backfilled so far (see sync.py; this fills in gradually), scoped
    # to responses that landed within the window.
    response_rows = (
        db.query(func.extract("epoch", Issue.first_response_at - Issue.created_at))
        .filter(
            Issue.repo_id == repo.id,
            Issue.first_response_at.isnot(None),
            Issue.first_response_at >= window_start,
        )
        .all()
    )
    response_hours_list = sorted(float(row[0]) / 3600 for row in response_rows)
    avg_response_hours = _percentile(response_hours_list, 0.5) if response_hours_list else None

    # commitsTotal ("commits in the last 12 months") is its own fixed
    # window, independent of the picker — see the docstring above.
    commits_last_year = (
        db.query(func.count(Commit.id))
        .filter(Commit.repo_id == repo.id, Commit.authored_at >= datetime.datetime.utcnow() - datetime.timedelta(days=365))
        .scalar()
    )
    # commits/week *does* follow the picker: commits in the window, spread
    # over however many weeks the window spans.
    commits_in_window = (
        db.query(func.count(Commit.id))
        .filter(Commit.repo_id == repo.id, Commit.authored_at >= window_start)
        .scalar()
    )
    commits_per_week = round(commits_in_window / (days / 7), 1) if commits_in_window else 0.0

    months = _month_boundaries(12)
    trend_merge = []
    trend_issue = []
    for _, start, end in months:
        month_median = (
            db.query(_median_hours(PullRequest.created_at, PullRequest.merged_at))
            .filter(
                PullRequest.repo_id == repo.id,
                PullRequest.merged_at.isnot(None),
                PullRequest.merged_at >= start,
                PullRequest.merged_at < end,
            )
            .scalar()
        )
        trend_merge.append(round(float(month_median), 1) if month_median is not None else 0.0)

        month_response = (
            db.query(_median_hours(Issue.created_at, Issue.first_response_at))
            .filter(
                Issue.repo_id == repo.id,
                Issue.first_response_at.isnot(None),
                Issue.first_response_at >= start,
                Issue.first_response_at < end,
            )
            .scalar()
        )
        trend_issue.append(round(float(month_response), 1) if month_response is not None else 0.0)

    # The Overview table's "90-day trend" sparkline reuses the same 12
    # monthly merge-time points rather than a separate weekly query — one
    # fewer thing to keep in sync, at the cost of it not literally
    # spanning 90 days.
    spark = trend_merge

    # Commit heatmap: 53 weeks x 7 days, oldest week first, ending today.
    # Sequential 7-day chunks, not calendar-week-aligned — matches how the
    # frontend already lays the grid out.
    heatmap_start = (datetime.datetime.utcnow() - datetime.timedelta(days=53 * 7 - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    day_counts = dict(
        db.query(func.date(Commit.authored_at), func.count(Commit.id))
        .filter(Commit.repo_id == repo.id, Commit.authored_at >= heatmap_start)
        .group_by(func.date(Commit.authored_at))
        .all()
    )
    heatmap = []
    cursor = heatmap_start.date()
    for _ in range(53):
        week = []
        for _ in range(7):
            week.append(day_counts.get(cursor, 0))
            cursor += datetime.timedelta(days=1)
        heatmap.append(week)

    # Status is a policy, not a measurement — someone has to define the
    # threshold. This one: average merge time under two days reads as
    # healthy; at or past it reads as a growing backlog. A repo with zero
    # merged PRs yet defaults to "healthy" rather than flagging on no data.
    if avg_merge_hours >= 48:
        status, status_variant = "Backlog growing", "destructive"
    else:
        status, status_variant = "Healthy", "secondary"

    top_contributors = (
        db.query(Contributor)
        .filter(Contributor.repo_id == repo.id)
        .order_by(Contributor.contributions.desc())
        .limit(10)
        .all()
    )

    # A genuinely different ranking from top_contributors above, not a
    # slice of it: that one is GitHub's all-time cumulative contributions
    # count, unrelated to any window. This is who's actually been active in
    # the last 30 days — its own fixed window, independent of `days` (the
    # page's date-range picker), so the "this month" label it backs stays
    # true regardless of what range is selected elsewhere on the page.
    month_start = datetime.datetime.utcnow() - datetime.timedelta(days=30)
    top_this_month = (
        db.query(Commit.author, func.count(Commit.id).label("commits"))
        .filter(Commit.repo_id == repo.id, Commit.authored_at >= month_start, Commit.author.isnot(None))
        .group_by(Commit.author)
        .order_by(func.count(Commit.id).desc())
        .limit(5)
        .all()
    )

    return {
        "id": repo.full_name,
        "lang": repo.language or "—",
        "license": repo.license or "—",
        "stars": _format_compact(repo.stars),
        "forks": _format_compact(repo.forks),
        "openPrs": _format_count(pr_totals.open or 0),
        "merge": {"v": round(avg_merge_hours, 1), "d": _format_duration(avg_merge_hours)},
        "response": {
            "v": round(avg_response_hours, 1) if avg_response_hours is not None else None,
            "d": _format_duration(avg_response_hours) if avg_response_hours is not None else "—",
        },
        "issues": {"v": open_issues or 0, "d": _format_count(open_issues or 0)},
        "contrib": {"v": contributors_count or 0, "d": _format_count(contributors_count or 0)},
        "mergeRate": {"v": merge_rate_pct, "d": f"{merge_rate_pct}%"},
        "commits": {"v": commits_per_week, "d": str(commits_per_week)},
        "status": status,
        "statusVariant": status_variant,
        "spark": spark,
        "trendMerge": trend_merge,
        "trendIssue": trend_issue,
        "commitsTotal": _format_count(commits_last_year or 0),
        "dist": dist,
        "pct": pct,
        "top": [
            {
                "login": c.username,
                "commits": c.contributions or 0,
                "prs": c.prs_merged or 0,
                "reviews": c.reviews or 0,
                "last": _relative(c.last_active_at),
            }
            for c in top_contributors
        ],
        "topThisMonth": [
            {"login": author, "commits": commits} for author, commits in top_this_month
        ],
        "heatmap": heatmap,
    }

# ── endpoints ────────────────────────────────────────────────────────────

@router.get("/repos/{repo_id}/stats-naive")
def repo_stats_naive(repo_id: int, db: Session = Depends(get_db)):
    repo = db.query(Repo).filter_by(id=repo_id).first()

    # N+1 as originally billed doesn't actually hold here — see
    # PERFORMANCE.md. Left exactly as Part 8 specifies: this is the
    # deliberately-naive baseline that Part 10's measurement compares
    # against, addressed by numeric id (not owner/name) since it's a
    # measurement tool, not something the UI calls.
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

@router.get("/repos/{repo_full_name:path}/stats")
def repo_stats_optimized(
    repo_full_name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    repo = get_repo_or_404(db, user.id, repo_full_name)
    cache_key = f"repo_stats:{repo.id}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    result = (
        db.query(
            func.avg(
                func.extract("epoch", PullRequest.merged_at - PullRequest.created_at)
            ).label("avg_seconds"),
            func.count(PullRequest.id).label("total"),
        )
        .filter(PullRequest.repo_id == repo.id, PullRequest.merged_at.isnot(None))
        .first()
    )

    avg_seconds = float(result.avg_seconds) if result.avg_seconds is not None else 0.0
    response = {
        "repo": repo.full_name,
        "avg_merge_time_hours": round(avg_seconds / 3600, 1),
        "total_prs": result.total,
    }
    cache_set(cache_key, response, ttl_seconds=900)
    return response

@router.get("/repos/{repo_full_name:path}/full")
def repo_full(
    repo_full_name: str,
    days: int = DaysParam,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = get_repo_or_404(db, user.id, repo_full_name)
    cache_key = f"repo_full:{repo.id}:{days}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    data = compute_repo_full(db, repo, days=days)
    cache_set(cache_key, data, ttl_seconds=900)
    return data

@router.get("/repos/{repo_full_name:path}/contributors")
def repo_contributors(
    repo_full_name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    repo = get_repo_or_404(db, user.id, repo_full_name)
    contributors = (
        db.query(Contributor).filter_by(repo_id=repo.id).order_by(Contributor.contributions.desc()).all()
    )
    return [
        {
            "username": c.username,
            "avatarUrl": c.avatar_url,
            "contributions": c.contributions,
            "prsMerged": c.prs_merged or 0,
            "reviews": c.reviews or 0,
            "lastActive": _relative(c.last_active_at),
        }
        for c in contributors
    ]

@router.get("/repos/{repo_full_name:path}/watch")
def get_watch_status(
    repo_full_name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Whether GITHUB_TOKEN's own account is currently watching this repo on
    GitHub — a real subscription, not anything tracked in our own DB. Reads
    straight from GitHub rather than caching: subscribing is rare enough
    that a live call on page load is cheap, and caching a boolean this
    binary would only risk showing a stale "not watching" right after the
    Watch button was just clicked."""
    get_repo_or_404(db, user.id, repo_full_name)
    try:
        # follow_redirects: GitHub 301s this exact endpoint to its
        # numeric-id form (`/repositories/{id}/subscription`) for at least
        # some repos — confirmed against the real API, not hypothetical —
        # same reason sync.py's own client sets this.
        response = httpx.get(
            f"{GITHUB_API}/repos/{repo_full_name}/subscription",
            headers=HEADERS,
            timeout=10,
            follow_redirects=True,
        )
    except httpx.HTTPError:
        raise HTTPException(502, "Couldn't reach GitHub to check watch status")
    if response.status_code == 404:
        return {"watching": False}
    if response.status_code == 403:
        raise HTTPException(403, "GITHUB_TOKEN doesn't have permission to read watch status on GitHub's behalf")
    if response.status_code != 200:
        raise HTTPException(502, f"GitHub returned an unexpected error ({response.status_code})")
    return {"watching": bool(response.json().get("subscribed"))}

@router.put("/repos/{repo_full_name:path}/watch")
def watch_repo(
    repo_full_name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Subscribes GITHUB_TOKEN's own account to the repo's notifications —
    the same effect as clicking "Watch" on github.com, for whichever
    account that token belongs to. `ignored: false` matters: PUTting a
    subscription with only `subscribed: true` still leaves a prior
    "ignored" state in place on GitHub's side, which would mute the very
    notifications this is meant to turn on."""
    get_repo_or_404(db, user.id, repo_full_name)
    try:
        response = httpx.put(
            f"{GITHUB_API}/repos/{repo_full_name}/subscription",
            headers=HEADERS,
            json={"subscribed": True, "ignored": False},
            timeout=10,
            follow_redirects=True,
        )
    except httpx.HTTPError:
        raise HTTPException(502, "Couldn't reach GitHub to watch this repository")
    if response.status_code == 403:
        raise HTTPException(403, "GITHUB_TOKEN doesn't have permission to watch repositories on GitHub's behalf")
    if response.status_code != 200:
        raise HTTPException(502, f"GitHub returned an unexpected error ({response.status_code})")
    return {"watching": True}

@router.delete("/repos/{repo_full_name:path}/watch")
def unwatch_repo(
    repo_full_name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Removes the subscription entirely (not the same as "ignore", which
    GitHub tracks as its own state) — the counterpart to watch_repo above."""
    get_repo_or_404(db, user.id, repo_full_name)
    try:
        response = httpx.delete(
            f"{GITHUB_API}/repos/{repo_full_name}/subscription",
            headers=HEADERS,
            timeout=10,
            follow_redirects=True,
        )
    except httpx.HTTPError:
        raise HTTPException(502, "Couldn't reach GitHub to unwatch this repository")
    if response.status_code == 403:
        raise HTTPException(403, "GITHUB_TOKEN doesn't have permission to change watch status on GitHub's behalf")
    if response.status_code not in (204, 404):
        raise HTTPException(502, f"GitHub returned an unexpected error ({response.status_code})")
    return {"watching": False}

@router.get("/overview")
def overview(days: int = DaysParam, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Scoped to this user's own tracked repos — was a global cache key
    # before there were multiple users' dashboards to keep apart, which
    # would otherwise hand user B whatever user A's tracked-repo set last
    # computed here.
    cache_key = f"overview:{user.id}:{days}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    repos = (
        db.query(Repo)
        .join(TrackedRepo, TrackedRepo.repo_id == Repo.id)
        .filter(TrackedRepo.user_id == user.id)
        .order_by(Repo.id)
        .all()
    )
    if not repos:
        return {"repos": [], "kpis": None}

    repo_stats = [compute_repo_full(db, r, days=days) for r in repos]

    now = datetime.datetime.utcnow()
    period = datetime.timedelta(days=days)
    week = datetime.timedelta(days=7)
    repo_ids = [r.id for r in repos]

    def _avg_merge_hours_between(start, end):
        row = (
            db.query(_median_hours(PullRequest.created_at, PullRequest.merged_at))
            .filter(
                PullRequest.repo_id.in_(repo_ids),
                PullRequest.merged_at.isnot(None),
                PullRequest.merged_at >= start,
                PullRequest.merged_at < end,
            )
            .scalar()
        )
        return float(row) if row is not None else 0.0

    def _open_issues_asof(cutoff):
        return (
            db.query(func.count(Issue.id))
            .filter(
                Issue.repo_id.in_(repo_ids),
                Issue.created_at <= cutoff,
                (Issue.closed_at.is_(None)) | (Issue.closed_at > cutoff),
            )
            .scalar()
        )

    def _active_contributors_between(start, end):
        pr_authors = (
            db.query(PullRequest.author)
            .filter(PullRequest.repo_id.in_(repo_ids), PullRequest.created_at >= start, PullRequest.created_at < end)
            .distinct()
        )
        commit_authors = (
            db.query(Commit.author)
            .filter(Commit.repo_id.in_(repo_ids), Commit.authored_at >= start, Commit.authored_at < end, Commit.author.isnot(None))
            .distinct()
        )
        return len({row[0] for row in pr_authors} | {row[0] for row in commit_authors})

    def _prs_merged_between(start, end):
        return (
            db.query(func.count(PullRequest.id))
            .filter(PullRequest.repo_id.in_(repo_ids), PullRequest.merged_at >= start, PullRequest.merged_at < end)
            .scalar()
        )

    def _delta(current, previous):
        if not previous:
            return 0.0
        return round((current - previous) / previous, 3)

    avg_merge_now = _avg_merge_hours_between(now - period, now)
    avg_merge_prev = _avg_merge_hours_between(now - 2 * period, now - period)

    open_issues_now = _open_issues_asof(now)
    open_issues_prev = _open_issues_asof(now - period)

    contrib_now = _active_contributors_between(now - period, now)
    contrib_prev = _active_contributors_between(now - 2 * period, now - period)

    prs_week_now = _prs_merged_between(now - week, now)
    prs_week_prev = _prs_merged_between(now - 2 * week, now - week)

    # 12 monthly points per KPI, reusing each repo's own trendMerge (already
    # computed above) rather than re-querying — summed/averaged across repos
    # so the sparkline shape matches what the per-repo trend charts show.
    months = _month_boundaries(12)
    merge_sparkline = [
        round(sum(r["trendMerge"][i] for r in repo_stats) / len(repo_stats), 1) for i in range(12)
    ]

    open_issues_sparkline = [_open_issues_asof(end) for _, _, end in months]
    contrib_sparkline = [_active_contributors_between(start, end) for start, end in [(m[1], m[2]) for m in months]]
    weeks12 = _week_boundaries(12)
    prs_sparkline = [_prs_merged_between(start, end) for start, end in weeks12]

    period_label = f"vs. previous {days} days"
    result = {
        "repos": repo_stats,
        "kpis": {
            "avgMergeTime": {
                "value": _format_duration(avg_merge_now),
                "delta": _delta(avg_merge_now, avg_merge_prev),
                "deltaLabel": period_label,
                "sparkline": merge_sparkline,
            },
            "openIssues": {
                "value": _format_count(open_issues_now),
                "delta": _delta(open_issues_now, open_issues_prev),
                "deltaLabel": period_label,
                "sparkline": open_issues_sparkline,
            },
            "contributors": {
                "value": _format_count(contrib_now),
                "delta": _delta(contrib_now, contrib_prev),
                "deltaLabel": period_label,
                "sparkline": contrib_sparkline,
            },
            "prsThisWeek": {
                "value": _format_count(prs_week_now),
                "delta": _delta(prs_week_now, prs_week_prev),
                "deltaLabel": "vs. previous week",
                "sparkline": prs_sparkline,
            },
        },
    }
    cache_set(cache_key, result, ttl_seconds=900)
    return result

@router.post("/sync")
def trigger_sync():
    """Kicks off the same Celery job the 15-minute beat schedule runs
    (see celery_app.py) — one task per tracked repo, queued immediately
    rather than waiting for the next scheduled tick. Fire-and-forget: this
    returns as soon as the tasks are queued, not once they've finished
    (a full sync can take a few minutes per repo), so the response carries
    no new data for the UI to show — it's a trigger, not a fetch."""
    result = sync_all_repos.delay()
    return {"status": "queued", "taskId": result.id}

@router.get("/sync/status")
def sync_status():
    """Polled by the Topbar's "Sync now" button while a sync is in flight —
    see sync.py's get_sync_status for how this is tracked. `state` is
    "idle" (nothing running, or the last run's status has expired),
    "running" (at least one tracked repo still pending), or "complete"
    (every tracked repo landed on "done" or "failed"). `repos` maps each
    tracked repo's full name to its own outcome so the UI can show
    per-repo failures rather than just a pass/fail for the whole batch."""
    return get_sync_status()

@router.post("/sync/stop")
def stop_sync():
    """The progress toast's Stop button — see sync.py's cancel_sync for
    what "stopping" actually means (best-effort: a task already
    mid-write can leave a repo partially synced, cleaned up by the next
    run). Returns the repos that were actually still pending and so
    actually got cancelled — clicking Stop after everything already
    finished is a harmless no-op, reported as an empty list."""
    return cancel_sync()

class AddRepoRequest(BaseModel):
    fullName: str

@router.get("/repos")
def list_repos(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """This user's own tracked-repo list, for the Sidebar and the Compare
    page — both need it before (and independent of) any per-repo stats.
    Ordered by TrackedRepo.id (the order this user added each one, not
    Repo.id — a repo other users tracked long before this user found it
    shouldn't jump to the front of their list) so a repo's position — and
    with it, repoColor's palette assignment on the frontend — stays stable
    as more get added, rather than shifting whenever the set changes."""
    tracked = (
        db.query(TrackedRepo)
        .filter_by(user_id=user.id)
        .join(Repo)
        .order_by(TrackedRepo.id)
        .all()
    )
    return [{"fullName": t.repo.full_name, "id": t.repo.id} for t in tracked]

@router.post("/repos")
def add_repo(payload: AddRepoRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The Overview page's "Add repository" dialog. Verifies the repo is a
    real, public GitHub repository *synchronously* (so a typo or a private
    repo gets an immediate, specific error) before creating its row —
    unlike sync_one_repo, which creates a bare row first and would only
    fail invisibly, inside a background task, on a bad name. The full
    PR/issue/commit/contributor sync still happens in the background:
    that part can genuinely take minutes, which a request handler
    shouldn't block on."""
    full_name = payload.fullName.strip()
    if not REPO_FULL_NAME_RE.match(full_name):
        raise HTTPException(422, 'Expected "owner/repo", e.g. "facebook/react"')

    repo = db.query(Repo).filter_by(full_name=full_name).first()

    if repo is not None:
        # Someone (possibly this same user, previously; possibly another
        # user entirely) already tracks this repo, so its Repo row — and
        # everything already synced onto it — exists and is kept fresh by
        # the beat schedule regardless. All that's missing, if anything, is
        # *this* user's own link to it: no GitHub round trip and no new
        # sync needed, both already happened when the row was first created.
        already_tracked = (
            db.query(TrackedRepo).filter_by(user_id=user.id, repo_id=repo.id).first()
        )
        if already_tracked is not None:
            raise HTTPException(409, f"{full_name} is already tracked")
    else:
        owner, name = full_name.split("/")
        try:
            response = httpx.get(f"{GITHUB_API}/repos/{owner}/{name}", headers=HEADERS, timeout=10)
        except httpx.HTTPError:
            raise HTTPException(502, "Couldn't reach GitHub to verify this repository")
        if response.status_code == 404:
            raise HTTPException(404, f"{full_name} isn't a public GitHub repository")
        if response.status_code != 200:
            raise HTTPException(502, f"GitHub returned an unexpected error ({response.status_code})")

        data = response.json()
        license_info = data.get("license") or {}
        repo = Repo(
            full_name=full_name,
            stars=data.get("stargazers_count"),
            forks=data.get("forks_count"),
            language=data.get("language"),
            license=license_info.get("spdx_id") or license_info.get("name"),
        )
        db.add(repo)
        db.flush()  # assigns repo.id without ending the transaction

        sync_one_repo.delay(full_name)

    db.add(TrackedRepo(user_id=user.id, repo_id=repo.id))
    db.commit()
    db.refresh(repo)

    # This user's own overview is cached per `days` window; a newly tracked
    # repo (even before its own sync finishes, for a genuinely new one)
    # needs to show up there right away rather than waiting out the cache's
    # 15-minute TTL. Scoped to this user — nobody else's cached overview
    # changed.
    cache_delete_prefix(f"overview:{user.id}:")

    return {"fullName": repo.full_name, "id": repo.id}
