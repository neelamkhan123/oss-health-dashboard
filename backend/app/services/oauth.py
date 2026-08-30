# backend/app/services/oauth.py
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import OAuthAccount, User


@dataclass(frozen=True)
class OAuthUser:
    """The normalised shape both providers get boiled down to, so the router
    never has to branch on which one it's talking to."""

    provider: str
    account_id: str
    email: str
    # Whether the *provider* has confirmed the user controls that address.
    # Load-bearing — see upsert_oauth_user below for what it guards.
    email_verified: bool
    name: str | None
    avatar_url: str | None


def _redirect_uri(provider: str) -> str:
    """Must match what you registered in Parts 01 and 02, byte for byte —
    both providers compare it as an exact string, and both send it twice
    (once on the authorise redirect, once on the token exchange) where it
    has to be identical both times."""
    return f"{settings.api_base_url}/api/auth/{provider}/callback"


# ── building the authorise URL ──────────────────────────────────────────

def github_authorize_url(state: str) -> str:
    if not settings.github_client_id:
        raise HTTPException(503, "GitHub sign-in is not configured on this server")
    return "https://github.com/login/oauth/authorize?" + urlencode({
        "client_id": settings.github_client_id,
        "redirect_uri": _redirect_uri("github"),
        # read:user gets the profile; user:email is needed separately because
        # GitHub treats email addresses as their own scope.
        "scope": "read:user user:email",
        "state": state,
    })


def google_authorize_url(state: str) -> str:
    if not settings.google_client_id:
        raise HTTPException(503, "Google sign-in is not configured on this server")
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": _redirect_uri("google"),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        # We only need identity once, at sign-in, so don't ask for a refresh
        # token we'd then have to store and protect.
        "access_type": "online",
        # Always show the account chooser. Without it, anyone with several
        # Google accounts silently gets whichever one they used last.
        "prompt": "select_account",
    })


# ── trading the code for a profile ──────────────────────────────────────

async def fetch_github_user(code: str) -> OAuthUser:
    async with httpx.AsyncClient(timeout=10) as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": _redirect_uri("github"),
            },
            # Without this GitHub replies in form-encoding, not JSON.
            headers={"Accept": "application/json"},
        )
        # GitHub answers 200 even when the exchange failed, putting the
        # problem in the body as {"error": "bad_verification_code"} — so a
        # status check would miss it and the missing key is the real signal.
        token = token_res.json().get("access_token")
        if not token:
            raise HTTPException(400, "GitHub did not return an access token")

        headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        profile = (await client.get("https://api.github.com/user", headers=headers)).json()
        # /user only carries `email` when the account has a *public* email
        # set, which most don't. The dedicated endpoint always has it, and
        # is the only place GitHub reports whether it's verified.
        emails = (await client.get("https://api.github.com/user/emails", headers=headers)).json()

    primary = next((e for e in emails if e.get("primary")), None)
    if primary is None:
        raise HTTPException(400, "That GitHub account has no primary email address")

    return OAuthUser(
        provider="github",
        account_id=str(profile["id"]),
        email=primary["email"],
        email_verified=bool(primary.get("verified")),
        # Plenty of GitHub accounts leave the display name blank; the login
        # is always there and is what people recognise anyway.
        name=profile.get("name") or profile.get("login"),
        avatar_url=profile.get("avatar_url"),
    )


async def fetch_google_user(code: str) -> OAuthUser:
    async with httpx.AsyncClient(timeout=10) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "redirect_uri": _redirect_uri("google"),
                "grant_type": "authorization_code",
            },
        )
        token = token_res.json().get("access_token")
        if not token:
            raise HTTPException(400, "Google did not return an access token")

        # Google also returns a signed id_token holding the same claims, but
        # verifying that signature means fetching and caching Google's
        # rotating public keys. Asking userinfo over TLS with a token we
        # just received over TLS from Google gets the same guarantee with
        # none of that machinery.
        profile = (await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {token}"},
        )).json()

    if not profile.get("email"):
        raise HTTPException(400, "That Google account has no email address")

    return OAuthUser(
        provider="google",
        account_id=profile["sub"],          # Google's stable per-user id
        email=profile["email"],
        email_verified=bool(profile.get("email_verified")),
        name=profile.get("name"),
        avatar_url=profile.get("picture"),
    )


# ── turning a provider identity into a local user ───────────────────────

def upsert_oauth_user(db: Session, oauth_user: OAuthUser) -> User:
    """Find the local account this provider identity belongs to, creating or
    linking one if this is the first time we've seen it."""

    link = (
        db.query(OAuthAccount)
        .filter_by(provider=oauth_user.provider, provider_account_id=oauth_user.account_id)
        .first()
    )
    if link is not None:
        return link.user  # returning user, nothing to do

    existing = db.query(User).filter_by(email=oauth_user.email).first()

    # The security-critical branch. Linking a provider onto an existing
    # account by matching email is what lets someone who signed up with a
    # password add GitHub later instead of ending up with two accounts. But
    # it's only safe when the provider has actually verified the address:
    # if unverified emails were accepted, anyone could set a victim's
    # address at some provider and sign straight into their account.
    if existing is not None and not oauth_user.email_verified:
        raise HTTPException(
            400,
            "An account already exists with this email. Sign in with your "
            "password first, then link this provider.",
        )

    user = existing
    if user is None:
        user = User(
            email=oauth_user.email,
            name=oauth_user.name,
            avatar_url=oauth_user.avatar_url,
            # hashed_password stays null — this account has no password yet.
        )
        db.add(user)
        db.flush()  # assigns user.id without ending the transaction

    db.add(OAuthAccount(
        user_id=user.id,
        provider=oauth_user.provider,
        provider_account_id=oauth_user.account_id,
    ))
    db.commit()
    db.refresh(user)
    return user