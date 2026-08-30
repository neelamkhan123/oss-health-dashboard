# backend/app/services/auth.py
import datetime
import secrets

import bcrypt
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import User
from app.services.cache import r
from app.services.db import get_db

SESSION_COOKIE = "session"
TOKEN_TTL = datetime.timedelta(days=7)

# session:{token} -> user id, in Redis. Not a signed JWT: a JWT is only as
# revocable as its expiry, since anyone holding a still-valid one stays
# authenticated no matter what the server does — "sign out" could delete the
# browser's copy but nothing server-side, and a compromised token couldn't be
# killed either. An opaque token that's just a lookup key sidesteps both:
# deleting the Redis entry (logout, or any future "sign out everywhere")
# ends the session immediately, everywhere it's in use.
_SESSION_KEY_PREFIX = "session:"


def _session_key(token: str) -> str:
    return f"{_SESSION_KEY_PREFIX}{token}"


# bcrypt hashes at most 72 bytes and *raises* on anything longer (it used to
# truncate silently, which is what broke passlib — see Part 00). The signup
# schema rejects longer passwords up front, so this slice is belt-and-braces
# for any other caller. Slicing encoded bytes can split a multi-byte
# character, but bcrypt takes raw bytes and never decodes them, so that's
# harmless here.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:MAX_PASSWORD_BYTES], bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode()[:MAX_PASSWORD_BYTES], hashed.encode())


def create_session(user_id: int) -> str:
    """Start a session for user_id, valid for a week, and return the opaque
    token that names it.

    Only the id is stored. Anything else — email, name — would be a
    snapshot frozen at login that keeps being trusted after the row
    changes; the dependency below re-reads the user on every request
    instead."""
    token = secrets.token_urlsafe(32)
    r.set(_session_key(token), str(user_id), ex=int(TOKEN_TTL.total_seconds()))
    return token


def revoke_session(token: str) -> None:
    """Ends one session immediately, wherever it's in use — not just the
    browser that called this. Safe to call with a token that's already
    gone (a double logout, an expired cookie the browser never dropped):
    deleting an absent key is a no-op, not an error."""
    r.delete(_session_key(token))


def set_session_cookie(response: Response, token: str) -> None:
    """Hand the token to the browser as an httpOnly cookie.

    httpOnly is the whole point: JavaScript on your page cannot read this
    value, so a script injected through a dependency or a rendered string
    can't exfiltrate a session the way it could one kept in localStorage.
    The browser attaches it to requests on its own — the frontend never
    touches the token, and never has to remember to."""
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=int(TOKEN_TTL.total_seconds()),
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """FastAPI dependency: the signed-in user, or a 401.

    Put this in a route's signature to get the user; put it in
    `include_router(dependencies=[...])` to require a session without every
    route having to ask."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Not authenticated")

    user_id = r.get(_session_key(token))
    if user_id is None:
        # Covers a forged token, one Redis has expired, and one revoke_session
        # already deleted (a signed-out session, or a killed one) alike.
        # They're deliberately not distinguished in the response: an
        # attacker probing with guessed tokens learns nothing from the reply.
        raise HTTPException(401, "Invalid or expired session")

    user = db.get(User, int(user_id))
    if user is None:
        # A valid session for a row that's since been deleted. Drop the
        # session too — there's nothing left for it to authenticate into.
        revoke_session(token)
        raise HTTPException(401, "User no longer exists")
    return user