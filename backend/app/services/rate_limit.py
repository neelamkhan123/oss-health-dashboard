# backend/app/services/rate_limit.py
from fastapi import HTTPException

from app.services.cache import r

# 5 wrong passwords in 15 minutes locks the pair out for the rest of that
# window. Generous enough that someone who fat-fingers their password twice
# never notices, tight enough to make online guessing impractical.
LOGIN_ATTEMPT_LIMIT = 5
LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60


def _key(email: str, ip: str) -> str:
    # Both, not either: keying on email alone lets one IP lock a victim out
    # of their own account by deliberately failing their login (a denial-of-
    # service dressed up as brute-force defence); keying on IP alone lets
    # someone behind a shared/NAT'd address get rate limited by their
    # neighbours' mistakes. email.lower() so "User@x.com" and "user@x.com"
    # share a counter — Postgres' lookup in login() isn't case-insensitive
    # either, but the attempts counter doesn't need to match that, only to
    # not be trivially split by capitalisation.
    return f"login_attempts:{ip}:{email.lower()}"


def check_login_rate_limit(email: str, ip: str) -> None:
    """Raise 429 if this email+IP pair has already failed too many times
    recently. Call before touching the password hash — no point paying
    bcrypt's cost on an attempt that's going to be rejected regardless."""
    attempts = r.get(_key(email, ip))
    if attempts is not None and int(attempts) >= LOGIN_ATTEMPT_LIMIT:
        retry_after = r.ttl(_key(email, ip))
        raise HTTPException(
            429,
            "Too many login attempts. Try again in a few minutes.",
            headers={"Retry-After": str(max(retry_after, 1))},
        )


def record_login_failure(email: str, ip: str) -> None:
    """Bump the counter, starting its window on the first failure. INCR
    creates the key at 1 if it doesn't exist, so the EXPIRE only needs to
    run once — checking the post-INCR value for 1 rather than using
    SET...NX up front keeps this to a single round trip in the common case
    where the key already exists."""
    key = _key(email, ip)
    count = r.incr(key)
    if count == 1:
        r.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS)


def clear_login_attempts(email: str, ip: str) -> None:
    """A successful login resets the counter — this is meant to slow down
    guessing, not to punish someone for mistyping a password before getting
    it right."""
    r.delete(_key(email, ip))
