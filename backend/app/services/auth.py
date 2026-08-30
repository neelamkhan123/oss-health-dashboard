# backend/app/services/auth.py
import datetime

import bcrypt
from fastapi import Depends, HTTPException, Request, Response
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import User
from app.services.db import get_db

SESSION_COOKIE = "session"
TOKEN_TTL = datetime.timedelta(days=7)

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


def create_access_token(user_id: int) -> str:
    """A signed statement that this browser is user_id, valid for a week.

    Only the id goes in. Anything else — email, name — would be a snapshot
    frozen at login that keeps being trusted after the row changes; the
    dependency below re-reads the user on every request instead."""
    now = datetime.datetime.now(datetime.timezone.utc)
    return jwt.encode(
        {"sub": str(user_id), "iat": now, "exp": now + TOKEN_TTL},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


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

    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        # Covers a bad signature, a malformed token, and an expired one
        # alike. They're deliberately not distinguished in the response: an
        # attacker probing with forged tokens learns nothing from the reply.
        raise HTTPException(401, "Invalid or expired session")

    user = db.get(User, int(payload["sub"]))
    if user is None:
        # A valid token for a row that's since been deleted. The signature
        # is real, so this can't be caught above — it has to be a lookup.
        raise HTTPException(401, "User no longer exists")
    return user