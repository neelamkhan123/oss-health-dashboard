from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, declarative_base
import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)

    # Nullable now: an account created through GitHub or Google has no
    # password at all, and storing a fake unusable hash instead would mean
    # every login path has to know which hashes are real.
    hashed_password = Column(String, nullable=True)

    # Whatever the provider told us about them, so the sidebar can show a
    # name and face instead of a raw email. Both stay null for a plain
    # email/password signup, which is why neither is required.
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # delete-orphan: unlinking a provider should delete its row, not leave a
    # dangling link pointing at a user it's no longer attached to.
    oauth_accounts = relationship(
        "OAuthAccount", back_populates="user", cascade="all, delete-orphan"
    )

    # Same reasoning as oauth_accounts above: deleting a user should delete
    # which repos they track, not leave orphaned rows pointing at a user
    # that no longer exists.
    tracked_repos = relationship(
        "TrackedRepo", back_populates="user", cascade="all, delete-orphan"
    )


class OAuthAccount(Base):
    """One row per (user, provider) link — the join between a local account
    and an identity at GitHub or Google.

    The lookup key is (provider, provider_account_id), never the email: an
    email is something a user can change at the provider, while the account
    id is stable for the life of the account. Matching on email would mean
    someone renaming their GitHub address silently becomes a new user."""

    __tablename__ = "oauth_accounts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider = Column(String, nullable=False)            # "github" | "google"
    provider_account_id = Column(String, nullable=False)  # str, not int — Google's `sub` is opaque
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="oauth_accounts")

    __table_args__ = (
        # The uniqueness the callback depends on: one GitHub account can
        # never end up linked to two local users.
        UniqueConstraint("provider", "provider_account_id", name="uq_oauth_provider_account"),
    )

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

    # From GET /repos/{owner}/{name}/languages — bytes of code per language,
    # e.g. {"JavaScript": 5200000, "Rust": 2700000}. A second call from
    # `language` above: that field is linguist's single guess at the repo's
    # *primary* language, not the full breakdown GitHub's own UI shows.
    # Keyed by GitHub's own language names, so the frontend's color map
    # (frontend/src/lib/languageColors.ts) can match them directly.
    languages = Column(JSONB, nullable=True)

    pull_requests = relationship("PullRequest", back_populates="repo")
    issues = relationship("Issue", back_populates="repo")
    commits = relationship("Commit", back_populates="repo")
    # Whichever users have added this repo to their own dashboard — see
    # TrackedRepo below for why this is a join table rather than an
    # owner column here.
    trackers = relationship("TrackedRepo", back_populates="repo", cascade="all, delete-orphan")


class TrackedRepo(Base):
    """One row per (user, repo): which users have this repo on their own
    dashboard. Deliberately not a `user_id` column on Repo itself — a Repo
    row is a shared, deduplicated cache of one GitHub repository's synced
    data (see sync.py), and the same popular repo is expected to end up
    tracked by more than one user. A single owner column could only ever
    represent one of them; this join table lets any number of users track
    the same underlying Repo without re-verifying it against GitHub or
    re-syncing its history per user."""

    __tablename__ = "tracked_repos"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    repo_id = Column(Integer, ForeignKey("repos.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="tracked_repos")
    repo = relationship("Repo", back_populates="trackers")

    __table_args__ = (
        # The uniqueness add_repo depends on: adding a repo you already
        # track is a 409, not a second row.
        UniqueConstraint("user_id", "repo_id", name="uq_tracked_repo_user_repo"),
        Index("ix_tracked_repos_user", "user_id"),
    )

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
