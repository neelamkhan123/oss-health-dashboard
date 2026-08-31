# The first real tests in this repo. They run inside the api container
# (`task test:backend` / `docker compose exec api pytest`) and in CI against
# the Postgres + Redis service containers, so they share whatever env vars
# and network that environment provides — no separate test database or
# mocking needed for checks this shallow.
import secrets

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.models import OAuthAccount, TrackedRepo, User
from app.services.auth import SESSION_COOKIE, revoke_session
from app.services.db import SessionLocal

client = TestClient(app)

PASSWORD = "a-long-enough-test-password"


@pytest.fixture
def signed_in_client():
    """A TestClient carrying a real session cookie, plus the cleanup.

    Signing up is the only way to get a session — the cookie is httpOnly and
    opaque, and `get_current_user` resolves it through Redis, so there's
    nothing to forge. TestClient keeps the Set-Cookie the same way a browser
    would, which is what makes the guarded routes reachable at all.

    The teardown matters more than it looks: signup also seeds the new user's
    tracked repos (`track_default_repos`), so without it every local test run
    would leave a user and three tracked_repos rows behind in the dev
    database. CI's database is thrown away either way.
    """
    c = TestClient(app)
    email = f"test-{secrets.token_hex(6)}@example.com"
    response = c.post("/api/auth/signup", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text

    yield c

    token = c.cookies.get(SESSION_COOKIE)
    if token:
        revoke_session(token)
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=email).first()
        if user is not None:
            db.query(TrackedRepo).filter_by(user_id=user.id).delete()
            db.query(OAuthAccount).filter_by(user_id=user.id).delete()
            db.delete(user)
            db.commit()
    finally:
        db.close()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_debug_endpoints_are_gone():
    # Part 10.3's query-count scaffolding was registered on `app` rather than
    # the auth-guarded dashboard router, so it would have been world-readable
    # in production. Removed once PERFORMANCE.md was written; this keeps it
    # from being reintroduced by accident.
    assert client.get("/debug/query-count").status_code == 404


def test_dashboard_requires_authentication():
    # `include_router(dependencies=[Depends(get_current_user)])` is what
    # enforces this, so it's one assertion for every route under
    # /api/dashboard rather than a per-route check.
    assert client.get("/api/dashboard/overview").status_code == 401


def test_overview_endpoint_responds(signed_in_client):
    # Not asserting on content — repos may or may not be synced depending on
    # when this runs — just that the route exists and returns valid JSON
    # shaped the way the frontend expects (a "repos" key either way).
    response = signed_in_client.get("/api/dashboard/overview")
    assert response.status_code == 200
    assert "repos" in response.json()
