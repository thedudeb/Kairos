"""Pydantic request/response schemas for the auth endpoints."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models._base import Role


class UserSyncRequest(BaseModel):
    """Sent by Auth.js (frontend) -> /internal/auth/sync after a successful
    Google OAuth sign-in. The X-Internal-API-Key header authenticates the call."""

    email: EmailStr
    name: str | None = Field(default=None, max_length=200)
    image_url: str | None = Field(default=None, max_length=1024)


class UserOut(BaseModel):
    id: UUID
    email: EmailStr
    name: str | None
    image_url: str | None
    role: Role


class UserSyncResponse(BaseModel):
    """Returned to Auth.js so it can embed our claims in its session JWT."""

    user: UserOut
    session_token: str
