"""Slug generation and uniqueness helpers."""
from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.job import Job


def _base_slug(text: str) -> str:
    """Convert arbitrary text to a URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-{2,}", "-", text)
    text = text.strip("-")
    return text or "job"


def unique_job_slug(session: Session, title: str, exclude_job_id: UUID | None = None) -> str:
    """Generate a slug from `title` that is unique in the jobs table.

    If the base slug is taken, appends -2, -3, … until a free one is found.
    Pass `exclude_job_id` when editing an existing job so its own slug is not
    considered a conflict.
    """
    base = _base_slug(title)
    candidate = base
    counter = 2

    while True:
        q = select(func.count()).select_from(Job).where(Job.slug == candidate)
        if exclude_job_id is not None:
            q = q.where(Job.id != exclude_job_id)
        taken = session.execute(q).scalar_one()
        if not taken:
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1


def validate_slug(slug: str) -> str:
    """Return a normalised slug or raise ValueError."""
    normalised = _base_slug(slug)
    if not normalised:
        raise ValueError("slug must contain at least one alphanumeric character")
    return normalised
