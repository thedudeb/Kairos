"""A job listing. Each job is its own workspace.

Form fields and assessment questions are SNAPSHOT-copied from a template at
apply-time, not live-linked, so later edits to a template don't surprise
admins by changing live jobs.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import JSON, Column, String
from sqlmodel import Field, SQLModel

from app.models._base import FieldType, JobStatus, TimestampMixin, uuid_pk


class Job(TimestampMixin, SQLModel, table=True):
    __tablename__ = "jobs"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    title: str = Field(max_length=200)
    slug: str = Field(sa_column=Column(String(200), unique=True, nullable=False, index=True))
    description_md: str = Field(default="", sa_column=Column(String, nullable=False))
    status: JobStatus = Field(default=JobStatus.draft, index=True)
    template_id: UUID | None = Field(default=None, foreign_key="templates.id")
    created_by_id: UUID | None = Field(default=None, foreign_key="users.id")


class JobFormField(SQLModel, table=True):
    __tablename__ = "job_form_fields"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    job_id: UUID = Field(foreign_key="jobs.id", nullable=False, index=True)
    label: str = Field(max_length=200)
    field_type: FieldType
    is_required: bool = Field(default=False)
    options: list[str] | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    sort_order: int = Field(default=0)


class JobAssessmentQuestion(SQLModel, table=True):
    __tablename__ = "job_assessment_questions"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    job_id: UUID = Field(foreign_key="jobs.id", nullable=False, index=True)
    question_text: str = Field(max_length=2000)
    max_duration_seconds: int | None = Field(default=None)
    max_attempts: int = Field(default=1)
    sort_order: int = Field(default=0)
