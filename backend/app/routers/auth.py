# backend/app/routers/auth.py
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import OAuthAccount, User
from app.services.auth import (
    SESSION_COOKIE,
    clear_session_cookie,
    create_session,
    get_current_user,
    hash_password,
    revoke_session,
    set_session_cookie,
    verify_password,
)
from app.services.db import get_db
from app.services.oauth import (
    fetch_github_user,
    fetch_google_user,
    github_authorize_url,
    google_authorize_url,
    upsert_oauth_user,
)
from app.services.rate_limit import (
    check_login_rate_limit,
    clear_login_attempts,
    record_login_failure,
)
from app.services.sync import track_default_repos

router = APIRouter()

OAUTH_STATE_COOKIE = "oauth_state"

# One table instead of if/elif chains in both OAuth routes. Adding a third
# provider is a line here plus two functions in services/oauth.py.
PROVIDERS = {
    "github": (github_authorize_url, fetch_github_user),
    "google": (google_authorize_url, fetch_google_user),
}


def serialize(user: User) -> dict:
    """camelCase to match what the rest of your API already returns (see
    /dashboard/repos' `fullName`), so the frontend types stay consistent.
    Note what's absent: hashed_password never leaves this process."""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatarUrl": user.avatar_url,
    }


# ── email + password ────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    # max_length=72 is bcrypt's hard ceiling — rejecting it here as a clear
    # 422 beats letting hash_password quietly truncate. min_length is a
    # floor worth having, but only on signup: enforcing it on login would
    # turn a wrong password into a validation error instead of a 401.
    password: str = Field(min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/signup")
def signup(req: SignupRequest, response: Response, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=req.email).first():
        raise HTTPException(400, "That email is already registered")

    user = User(email=req.email, hashed_password=hash_password(req.password))
    db.add(user)
    db.flush()  # assigns user.id without ending the transaction
    track_default_repos(db, user.id)
    db.commit()
    db.refresh(user)

    # Declaring `response: Response` lets FastAPI merge headers set here into
    # the response it builds around the returned dict — so the new account is
    # signed in immediately, with no second round trip to /login.
    set_session_cookie(response, create_session(user.id))
    return serialize(user)


@router.post("/login")
def login(req: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    # request.client is only None for requests with no transport-level
    # peer (e.g. ASGI test clients that don't set one) — "unknown" still
    # gives every such request one shared bucket rather than crashing.
    ip = request.client.host if request.client else "unknown"
    check_login_rate_limit(req.email, ip)

    user = db.query(User).filter_by(email=req.email).first()

    # Three failures, one message. `hashed_password is None` is the
    # OAuth-only account case and has to be checked before verify_password,
    # which would raise on None. Telling them apart in the response would
    # leak which emails are registered and how they signed up.
    if user is None or user.hashed_password is None or not verify_password(
        req.password, user.hashed_password
    ):
        record_login_failure(req.email, ip)
        raise HTTPException(401, "Incorrect email or password")

    clear_login_attempts(req.email, ip)
    set_session_cookie(response, create_session(user.id))
    return serialize(user)


@router.post("/logout")
def logout(request: Request, response: Response):
    # Revoke server-side first, not just clear the cookie: the point of a
    # revocable session is that logout ends it everywhere, not just in the
    # browser that clicked the button — a copy of the cookie stolen before
    # this request would otherwise keep working for the rest of its week.
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        revoke_session(token)
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    """Who the session cookie belongs to, or 401. The frontend calls this on
    every page load to decide whether to show the app or the login page —
    it's the only way it can, since it cannot read the httpOnly cookie."""
    return serialize(user)


# ── OAuth ───────────────────────────────────────────────────────────────

@router.get("/{provider}/login")
def oauth_login(provider: str):
    """Where the 'Continue with GitHub/Google' buttons point."""
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")

    authorize_url, _ = PROVIDERS[provider]
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(authorize_url(state), status_code=302)

    # The standard OAuth CSRF defence. Parking the same random string in a
    # cookie lets the callback prove the redirect it receives is the tail
    # end of a round trip *this browser* started, rather than a callback URL
    # an attacker constructed and got the user to click.
    #
    # samesite must be "lax", not "strict", regardless of the cookie setting
    # used for sessions: the callback arrives as a cross-site navigation
    # from github.com or google.com, and strict withholds cookies on exactly
    # that kind of request — the flow would fail every time.
    response.set_cookie(
        OAUTH_STATE_COOKIE, state,
        httponly=True, secure=settings.cookie_secure, samesite="lax",
        max_age=600, path="/",
    )
    return response


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """Where the provider sends the browser back to.

    Every failure redirects to the login page with an ?error= code rather
    than raising: the user is looking at a browser navigation here, and a
    raw FastAPI JSON error page is a dead end they can't act on."""
    login_page = f"{settings.frontend_url}/login"

    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")

    # The user hit "Cancel" on the provider's consent screen.
    if error or not code:
        return RedirectResponse(f"{login_page}?error=oauth_denied", status_code=302)

    expected = request.cookies.get(OAUTH_STATE_COOKIE)
    # compare_digest rather than ==, so the comparison doesn't leak the
    # correct value through how long it takes to fail.
    if not expected or not state or not secrets.compare_digest(expected, state):
        return RedirectResponse(f"{login_page}?error=bad_state", status_code=302)

    _, fetch_user = PROVIDERS[provider]
    try:
        oauth_user = await fetch_user(code)
        user = upsert_oauth_user(db, oauth_user)
    except HTTPException:
        # A provider that misbehaved, or the email-already-taken case from
        # upsert_oauth_user. Either way the user needs the login page back.
        return RedirectResponse(f"{login_page}?error=oauth_failed", status_code=302)

    response = RedirectResponse(settings.frontend_url, status_code=302)
    set_session_cookie(response, create_session(user.id))
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return response


@router.delete("/{provider}/unlink")
def unlink_provider(provider: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Removes this provider's link from the signed-in account — the
    schema (OAuthAccount) has always supported more than one provider per
    user, this is just the endpoint to take one back off.

    Refuses when it would be the last way back in: a password counts, and
    so does every *other* linked provider, but unlinking someone's only
    sign-in method would lock them out of their own account with no
    recovery path (see the missing-password-reset note elsewhere) —
    strictly worse than just leaving the stale link in place."""
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")

    link = db.query(OAuthAccount).filter_by(user_id=user.id, provider=provider).first()
    if link is None:
        raise HTTPException(404, f"No linked {provider} account")

    has_other_provider = (
        db.query(OAuthAccount)
        .filter(OAuthAccount.user_id == user.id, OAuthAccount.id != link.id)
        .first()
        is not None
    )
    if user.hashed_password is None and not has_other_provider:
        raise HTTPException(
            400,
            "This is your only way to sign in. Set a password or link "
            "another provider before unlinking it.",
        )

    db.delete(link)
    db.commit()
    return {"ok": True}