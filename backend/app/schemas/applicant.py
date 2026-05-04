"""Schemas for the admin applicant management API."""
from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models._base import ParseStatus, RankStatus


# ─── Parsed resume ────────────────────────────────────────────────────────────

class EducationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    institution: str | None
    degree: str | None
    field_of_study: str | None
    start_year: int | None
    end_year: int | None
    sort_order: int


class WorkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company: str | None
    title: str | None
    start_date: str | None
    end_date: str | None
    description: str | None
    sort_order: int


class SkillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    skill: str


class ParsedResumeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    full_name: str | None
    email: str | None
    phone: str | None
    top_institution: str | None
    top_degree: str | None
    confidence_notes: dict | None
    parsed_at: datetime
    education: list[EducationOut] = []
    work: list[WorkOut] = []
    skills: list[SkillOut] = []


# ─── Custom field values ──────────────────────────────────────────────────────

class CustomFieldValueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    job_form_field_id: UUID
    field_label: str
    value_text: str | None
    value_file_url: str | None


# ─── Fit score ────────────────────────────────────────────────────────────────

class FitScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: RankStatus
    fit_score: int | None
    skills_match: int | None
    experience_match: int | None
    trajectory: int | None
    reasoning: str | None
    model: str | None
    error: str | None
    generated_at: datetime | None


# ─── Notes ────────────────────────────────────────────────────────────────────

class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    body: str
    author_name: str
    created_at: datetime


class NoteCreate(BaseModel):
    body: str = Field(max_length=10_000)


# ─── Stage transition / activity timeline ─────────────────────────────────────

class ActivityEvent(BaseModel):
    id: UUID
    kind: str          # "stage_transition" | "note" | "application_received"
    timestamp: datetime
    actor_name: str | None
    detail: str        # human-readable description


# ─── Applicant list item ──────────────────────────────────────────────────────

class ApplicantListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    first_name: str
    last_name: str
    email: str
    phone: str
    parse_status: ParseStatus
    current_stage_id: UUID
    current_stage_name: str
    top_institution: str | None
    top_degree: str | None
    submitted_at: datetime
    stage_entered_at: datetime
    resume_url: str
    fit_score: int | None = None
    fit_status: RankStatus | None = None


# ─── Applicant detail ─────────────────────────────────────────────────────────

class ApplicantDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    job_id: UUID
    first_name: str
    last_name: str
    email: str
    phone: str
    parse_status: ParseStatus
    parse_error: str | None
    parse_attempts: int
    current_stage_id: UUID
    current_stage_name: str
    submitted_at: datetime
    stage_entered_at: datetime
    resume_url: str
    parsed_resume: ParsedResumeOut | None
    custom_fields: list[CustomFieldValueOut]
    notes: list[NoteOut]
    activity: list[ActivityEvent]
    fit_score: int | None = None
    fit_status: RankStatus | None = None
    fit_score_detail: FitScoreOut | None = None


# ─── Stage move ───────────────────────────────────────────────────────────────

class StageMoveRequest(BaseModel):
    stage_id: UUID
    notes: str | None = Field(default=None, max_length=2_000)


# ─── Parsed resume correction ─────────────────────────────────────────────────

_DATE_RE = re.compile(r"^\d{4}(-\d{2})?$|^present$", re.IGNORECASE)


class EducationCorrection(BaseModel):
    institution: str | None = Field(default=None, max_length=300)
    degree: str | None = Field(default=None, max_length=200)
    field_of_study: str | None = Field(default=None, max_length=200)
    start_year: int | None = None
    end_year: int | None = None


class WorkCorrection(BaseModel):
    company: str | None = Field(default=None, max_length=300)
    title: str | None = Field(default=None, max_length=200)
    start_date: str | None = Field(default=None, max_length=20)  # "YYYY" or "YYYY-MM"
    end_date: str | None = Field(default=None, max_length=20)    # "YYYY", "YYYY-MM", or "present"
    description: str | None = Field(default=None, max_length=2_000)

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def _validate_date_format(cls, v: object) -> object:
        if v is None:
            return v
        if not isinstance(v, str):
            raise ValueError("must be a string")
        if not _DATE_RE.match(v.strip()):
            raise ValueError("must be YYYY, YYYY-MM, or 'present'")
        return v.strip()


class ParsedResumeCorrection(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=30)
    top_institution: str | None = Field(default=None, max_length=300)
    top_degree: str | None = Field(default=None, max_length=200)
    skills: list[str] | None = Field(default=None, max_length=100)
    education: list[EducationCorrection] | None = Field(default=None)
    work: list[WorkCorrection] | None = Field(default=None)


