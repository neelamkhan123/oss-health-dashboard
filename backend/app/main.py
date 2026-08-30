from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import dashboard, auth
from app.services.auth import get_current_user
from app.services import query_debug  # noqa: F401 — import registers the SQLAlchemy event listeners
from app.config import settings

app = FastAPI(title="OSS Health Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    # Required for cookies to cross origins at all. Note it's incompatible
    # with allow_origins=["*"] — browsers reject that pairing outright, which
    # is why the origin has to be named explicitly.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(
    dashboard.router,
    prefix="/api/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(get_current_user)],
)

@app.get("/health")
def health():
    return {"status": "ok"}

# Part 10.3 scaffolding: query_debug's counters live in that module's process
# memory, so they're only readable from inside the same running server — this
# endpoint is that window. Not meant to ship; delete once the before/after
# numbers are recorded in PERFORMANCE.md.
@app.get("/debug/query-count")
def debug_query_count():
    return query_debug.query_count

@app.post("/debug/query-count/reset")
def debug_query_count_reset():
    query_debug.query_count["count"] = 0
    query_debug.query_count["total_time"] = 0.0
    return query_debug.query_count