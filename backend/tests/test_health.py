# The first real test in this repo — everything else in Part 16's CI
# workflow (a pytest step) has had nothing to actually run until now.
# Runs inside the api container (`task test:backend` / `docker compose exec
# api pytest`), so it shares the container's real env vars and network —
# no separate test database or mocking needed for a check this shallow.
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_overview_endpoint_responds():
    # Not asserting on content — repos may or may not be synced depending
    # on when this runs — just that the route exists and returns valid JSON
    # shaped the way the frontend expects (a "repos" key either way).
    response = client.get("/api/dashboard/overview")
    assert response.status_code == 200
    assert "repos" in response.json()
