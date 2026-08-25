from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import relationship, declarative_base
import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Repo(Base):
    __tablename__ = "repos"
    id = Column(Integer, primary_key=True)
    full_name = Column(String, unique=True, index=True, nullable=False)  # e.g. "facebook/react"
    last_synced_at = Column(DateTime, nullable=True)

    # From GET /repos/{owner}/{name} — not fetched until _sync_repo_meta.
    # Point-in-time only: no snapshot history, so these can be shown but
    # never trended.
    stars = Column(Integer, nullable=True)
    forks = Column(Integer, nullable=True)
    language = Column(String, nullable=True)
    license = Column(String, nullable=True)

    pull_requests = relationship("PullRequest", back_populates="repo")
    issues = relationship("Issue", back_populates="repo")
    commits = relationship("Commit", back_populates="repo")

class PullRequest(Base):
    __tablename__ = "pull_requests"
    id = Column(Integer, primary_key=True)
    repo_id = Column(Integer, ForeignKey("repos.id"), nullable=False)
    github_pr_number = Column(Integer, nullable=False)
    title = Column(String)
    author = Column(String)
    created_at = Column(DateTime)
    merged_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    repo = relationship("Repo", back_populates="pull_requests")

    __table_args__ = (
        Index("ix_pr_repo_created", "repo_id", "created_at"),
        # merged_at implies closed_at is set too (GitHub sets both together),
        # so "open" is closed_at IS NULL and "closed, not merged" is
        # closed_at IS NOT NULL AND merged_at IS NULL — no separate state
        # column needed, but both are queried by (repo_id, closed_at) enough
        # to index it directly.
        Index("ix_pr_repo_closed", "repo_id", "closed_at"),
    )

class Issue(Base):
    __tablename__ = "issues"
    id = Column(Integer, primary_key=True)
    repo_id = Column(Integer, ForeignKey("repos.id"), nullable=False)
    github_issue_number = Column(Integer, nullable=False)
    title = Column(String)
    author = Column(String)
    created_at = Column(DateTime)
    closed_at = Column(DateTime, nullable=True)
    is_open = Column(Boolean, default=True)

    # First comment on the issue NOT from the issue's own author — a cheap,
    # imperfect proxy for "first maintainer reply" (see sync.py's
    # _sync_issue_first_response for the actual heuristic and its caveats).
    # NULL until that lookup has run for this issue, which happens
    # incrementally (capped per sync run) rather than all at once.
    first_response_at = Column(DateTime, nullable=True)

    repo = relationship("Repo", back_populates="issues")

    __table_args__ = (
        Index("ix_issue_repo_created", "repo_id", "created_at"),
    )

class Contributor(Base):
    __tablename__ = "contributors"
    id = Column(Integer, primary_key=True)
    repo_id = Column(Integer, ForeignKey("repos.id"), nullable=False)
    username = Column(String, nullable=False)
    avatar_url = Column(String)
    contributions = Column(Integer, default=0)

    # Derived from this repo's own synced PRs/commits/reviews, not a second
    # GitHub call — kept updated incrementally as sync.py processes each of
    # those. See sync.py for exactly when each one gets touched.
    prs_merged = Column(Integer, default=0)
    reviews = Column(Integer, default=0)
    last_active_at = Column(DateTime, nullable=True)

class Commit(Base):
    __tablename__ = "commits"
    id = Column(Integer, primary_key=True)
    repo_id = Column(Integer, ForeignKey("repos.id"), nullable=False)
    sha = Column(String, nullable=False)
    author = Column(String, nullable=True)  # GitHub login; null for unlinked commit emails
    authored_at = Column(DateTime, nullable=False)

    repo = relationship("Repo", back_populates="commits")

    __table_args__ = (
        UniqueConstraint("repo_id", "sha", name="uq_commit_repo_sha"),
        Index("ix_commit_repo_authored", "repo_id", "authored_at"),
    )
