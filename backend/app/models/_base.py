"""Shared mixins and enums."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import func
from sqlmodel import Field


def uuid_pk() -> UUID:
    """Default factory for UUID primary keys."""
    return uuid4()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# NOTE: We use `sa_column_kwargs` (not `sa_column`) so each subclass gets its
# own Column instance. Sharing a single Column object across multiple tables
# raises "Column object already assigned to Table" at import time.
class TimestampMixin:
    """Adds created_at + updated_at managed by the database."""

    created_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={"server_default": func.now(), "nullable": False},
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={
            "server_default": func.now(),
            "onupdate": func.now(),
            "nullable": False,
        },
    )


class Role(StrEnum):
    admin = "admin"
    reviewer = "reviewer"


class JobStatus(StrEnum):
    draft = "draft"
    active = "active"
    closed = "closed"


class FieldType(StrEnum):
    text = "text"
    textarea = "textarea"
    email = "email"
    url = "url"
    number = "number"
    file = "file"
    dropdown = "dropdown"
    checkbox = "checkbox"


class ParseStatus(StrEnum):
    pending = "pending"
    parsing = "parsing"
    parsed = "parsed"
    failed = "failed"
    needs_manual = "needs_manual"
