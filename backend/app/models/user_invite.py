"""Pending staff invitations — consumed on first Google OAuth sign-in."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import Column, String, func
from sqlmodel import Field, SQLModel

from app.models._base import Role, uuid_pk


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserInvite(SQLModel, table=True):
    __tablename__ = "user_invites"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    email: str = Field(sa_column=Column(String(320), unique=True, nullable=False, index=True))
    role: Role = Field(nullable=False)
    invited_by_id: UUID | None = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={"server_default": func.now(), "nullable": False},
    )
