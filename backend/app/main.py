from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import dashboard, auth
from app.services.auth import get_current_user
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
