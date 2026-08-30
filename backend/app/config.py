from pathlib import Path

from pydantic_settings import BaseSettings

# Repo root .env — Docker Compose sets these as real env vars via `env_file:`,
# but running commands (e.g. alembic) directly on the host needs this loaded
# from disk. Resolved from this file's location, not the CWD, so it works no
# matter which directory the command is run from.
_REPO_ROOT_ENV = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    # The sync worker's own PAT — unrelated to github_client_id/secret below,
    # which are how *users* authenticate to this app.
    github_token: str

    # Empty defaults rather than required fields: the app should still boot
    # for someone who's only set up email/password. The login endpoint checks
    # for a missing id and returns a clear error instead of redirecting the
    # user to a broken provider screen.
    github_client_id: str = ""
    github_client_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""

    frontend_url: str = "http://localhost:5173"
    api_base_url: str = "http://localhost:8000"

    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    class Config:
        env_file = _REPO_ROOT_ENV
        # .env also carries POSTGRES_USER/PASSWORD/DB for the postgres
        # container itself (docker-compose's env_file:) — not app settings.
        extra = "ignore"


settings = Settings()