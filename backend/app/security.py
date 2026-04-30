"""JWT issuance + verification.

Auth.js (frontend) signs session JWTs with AUTH_SECRET. The frontend BFF forwards
that JWT as `Authorization: Bearer <jwt>` to the backend. We verify the same
HS256 signature and trust the claims we put there during the user-sync step.
"""
from __future__ import annotations

import hmac
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from sqlmodel import Session, select

from app.config import settings
from app.db import get_session
from app.models.user import User

ALGO = settings.jwt_algorithm


def issue_session_token(*, user_id: UUID, email: str, role: str, ttl_minutes: int = 60 * 24 * 30) -> str:
    """Issue a session JWT. Used by the user-sync endpoint so the frontend can
    embed our claims in its Auth.js session."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.auth_secret, algorithm=ALGO)


def decode_session_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.auth_secret, algorithms=[ALGO])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid session token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return authorization.split(" ", 1)[1].strip()


def get_current_user(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    token = _bearer(authorization)
    claims = decode_session_token(token)
    try:
        user_id = UUID(claims["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid sub claim") from exc

    user = session.exec(select(User).where(User.id == user_id)).first()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin role required")
    return user


def require_internal_api_key(x_internal_api_key: str | None = Header(default=None)) -> None:
    """Guard for server-to-server endpoints (Auth.js -> FastAPI user-sync).

    Uses hmac.compare_digest for constant-time comparison to prevent
    timing-based key enumeration attacks.
    """
    if not x_internal_api_key or not hmac.compare_digest(
        x_internal_api_key, settings.internal_api_key
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid internal api key")
