from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models._base import FieldType, JobDescriptionKind, JobStatus
from app.utils.slug import validate_slug

_CUSTOM_FILE_MIMES = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
)


def _validate_file_mimes(v: list[str] | None) -> list[str] | None:
    if v is None:
        return v
    bad = [x for x in v if x not in _CUSTOM_FILE_MIMES]
    if bad:
        raise ValueError(f"Unsupported file MIME types: {bad}")
    return v


class JobFormFieldIn(BaseModel):
    label: str = Field(max_length=200)
    field_type: FieldType
    is_required: bool = False
    options: list[str] | None = None
    sort_order: int = 0
    file_allowed_types: list[str] | None = None

    @field_validator("file_allowed_types")
    @classmethod
    def _file_types(cls, v: list[str] | None) -> list[str] | None:
        return _validate_file_mimes(v)


class JobFormFieldOut(JobFormFieldIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class JobAssessmentQuestionIn(BaseModel):
    question_text: str = Field(max_length=2000)
    max_duration_seconds: int | None = None
    max_attempts: int = Field(default=1, ge=1)
    sort_order: int = 0


class JobAssessmentQuestionOut(JobAssessmentQuestionIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class StageDistributionItem(BaseModel):
    stage_id: UUID
    stage_name: str
    count: int


class JobSummary(BaseModel):
    total_applicants: int
    new_this_week: int
    new_this_month: int
    stage_distribution: list[StageDistributionItem]


class JobCreate(BaseModel):
    title: str = Field(max_length=200)
    slug: str | None = Field(default=None, max_length=200)
    description_md: str = Field(default="", max_length=50_000)
    description_kind: JobDescriptionKind = JobDescriptionKind.markdown
    description_external_url: str | None = Field(default=None, max_length=2000)
    description_summary: str | None = Field(default=None, max_length=20_000)
    status: JobStatus = JobStatus.draft
    template_id: UUID | None = None

    @field_validator("slug", mode="before")
    @classmethod
    def normalise_slug(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return validate_slug(v)


class JobUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    slug: str | None = Field(default=None, max_length=200)
    description_md: str | None = Field(default=None, max_length=50_000)
    description_kind: JobDescriptionKind | None = None
    description_external_url: str | None = Field(default=None, max_length=2000)
    description_summary: str | None = Field(default=None, max_length=20_000)
    form_fields: list[JobFormFieldIn] | None = None
    assessment_questions: list[JobAssessmentQuestionIn] | None = None

    @field_validator("slug", mode="before")
    @classmethod
    def normalise_slug(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        return validate_slug(v)


class JobStatusUpdate(BaseModel):
    status: JobStatus


class ApplyTemplateRequest(BaseModel):
    template_id: UUID


class JobOut(BaseModel):
    id: UUID
    title: str
    slug: str
    description_md: str
    description_kind: JobDescriptionKind
    description_external_url: str | None
    description_summary: str | None
    status: JobStatus
    template_id: UUID | None
    created_at: datetime
    updated_at: datetime
    form_fields: list[JobFormFieldOut]
    assessment_questions: list[JobAssessmentQuestionOut]
    summary: JobSummary

    model_config = {"from_attributes": True}


class JobListItem(BaseModel):
    """Lighter representation for the admin landing page list."""

    id: UUID
    title: str
    slug: str
    status: JobStatus
    template_id: UUID | None
    created_at: datetime
    summary: JobSummary

    model_config = {"from_attributes": True}
