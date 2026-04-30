"""Admin/reviewer user accounts."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel

from app.models._base import Role, TimestampMixin, uuid_pk


class User(TimestampMixin, SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    email: str = Field(sa_column=Column(String(320), unique=True, nullable=False, index=True))
    name: str | None = Field(default=None, max_length=200)
    image_url: str | None = Field(default=None, max_length=1024)
    role: Role = Field(default=Role.reviewer, max_length=32)
