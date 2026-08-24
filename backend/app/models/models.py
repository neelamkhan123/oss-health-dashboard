from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Index
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

    pull_requests = relationship("PullRequest", back_populates="repo")
    issues = relationship("Issue", back_populates="repo")

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

    repo = relationship("Repo", back_populates="issues")

class Contributor(Base):
    __tablename__ = "contributors"
    id = Column(Integer, primary_key=True)
    repo_id = Column(Integer, ForeignKey("repos.id"), nullable=False)
    username = Column(String, nullable=False)
    avatar_url = Column(String)
    contributions = Column(Integer, default=0)