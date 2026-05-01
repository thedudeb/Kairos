"""Schemas for the public (unauthenticated) job portal API."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models._base import FieldType, JobDescriptionKind, JobStatus


class PublicFormField(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    label: str
    field_type: FieldType
    is_required: bool
    options: list[str] | None
    sort_order: int
    file_allowed_types: list[str] | None = None


class PublicJobResponse(BaseModel):
    id: UUID
    title: str
    slug: str
    status: JobStatus
    description_md: str
    description_kind: JobDescriptionKind
    description_external_url: str | None
    description_summary: str | None
    form_fields: list[PublicFormField]


class PublicJobListItem(BaseModel):
    """Minimal listing row for browsable careers index (active jobs only)."""

    slug: str
    title: str


class ApplicantSubmissionResponse(BaseModel):
    id: UUID
    message: str = "Application received. You'll get a confirmation email shortly."
