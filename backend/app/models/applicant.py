"""Applicant + resume parsing tables.

Applicant is per-job (a single person can apply to many jobs; each application
is a separate Applicant row). Parsed resume data is split between a 1:1 summary
table (denormalized columns for filterable fields) and child tables for
education/work/skills (proper relational filtering and grouping).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import JSON, Column, DateTime, String, UniqueConstraint, func
from sqlmodel import Field, SQLModel

from app.models._base import ParseStatus, TimestampMixin, uuid_pk


class Applicant(TimestampMixin, SQLModel, table=True):
    __tablename__ = "applicants"
    __table_args__ = (
        UniqueConstraint("job_id", "email", name="uq_applicants_job_email"),
    )

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    job_id: UUID = Field(foreign_key="jobs.id", nullable=False, index=True)
    current_stage_id: UUID = Field(foreign_key="pipeline_stages.id", nullable=False, index=True)

    first_name: str = Field(max_length=100)
    last_name: str = Field(max_length=100)
    email: str = Field(sa_column=Column(String(320), nullable=False, index=True))
    phone: str = Field(max_length=50)

    resume_gcs_path: str = Field(max_length=1024)

    parse_status: ParseStatus = Field(default=ParseStatus.pending, index=True)
    parse_error: str | None = Field(default=None, max_length=2000)
    parse_attempts: int = Field(default=0)

    submitted_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
    stage_entered_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class ApplicantCustomFieldValue(SQLModel, table=True):
    __tablename__ = "applicant_custom_field_values"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    applicant_id: UUID = Field(foreign_key="applicants.id", nullable=False, index=True)
    job_form_field_id: UUID = Field(foreign_key="job_form_fields.id", nullable=False)
    value_text: str | None = Field(default=None)
    value_file_gcs_path: str | None = Field(default=None, max_length=1024)


class ParsedResume(SQLModel, table=True):
    """1:1 summary of LLM-extracted fields. The `raw_json` column holds the full
    LLM response; the denormalized columns power filter/sort/group queries."""

    __tablename__ = "parsed_resumes"

    applicant_id: UUID = Field(foreign_key="applicants.id", primary_key=True)
    full_name: str | None = Field(default=None, max_length=300)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=50)
    top_institution: str | None = Field(default=None, max_length=300, index=True)
    top_degree: str | None = Field(default=None, max_length=300, index=True)
    raw_json: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    confidence_notes: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True),
    )
    parsed_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


class ApplicantEducation(SQLModel, table=True):
    __tablename__ = "applicant_education"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    applicant_id: UUID = Field(foreign_key="applicants.id", nullable=False, index=True)
    institution: str | None = Field(default=None, max_length=300, index=True)
    degree: str | None = Field(default=None, max_length=300, index=True)
    field_of_study: str | None = Field(default=None, max_length=300)
    start_year: int | None = Field(default=None)
    end_year: int | None = Field(default=None)
    sort_order: int = Field(default=0)


class ApplicantWork(SQLModel, table=True):
    __tablename__ = "applicant_work"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    applicant_id: UUID = Field(foreign_key="applicants.id", nullable=False, index=True)
    company: str | None = Field(default=None, max_length=300)
    title: str | None = Field(default=None, max_length=300)
    start_date: str | None = Field(default=None, max_length=10)  # YYYY-MM
    end_date: str | None = Field(default=None, max_length=10)
    description: str | None = Field(default=None)
    sort_order: int = Field(default=0)


class ApplicantSkill(SQLModel, table=True):
    __tablename__ = "applicant_skills"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    applicant_id: UUID = Field(foreign_key="applicants.id", nullable=False, index=True)
    skill: str = Field(max_length=200, index=True)


class ApplicantNote(TimestampMixin, SQLModel, table=True):
    __tablename__ = "applicant_notes"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    applicant_id: UUID = Field(foreign_key="applicants.id", nullable=False, index=True)
    author_id: UUID = Field(foreign_key="users.id", nullable=False)
    body: str
