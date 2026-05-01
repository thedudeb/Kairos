"""Schemas for the admin applicant management API."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

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
    raw_json: dict[str, Any]
    confidence_notes: dict[str, Any] | None
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

class EducationCorrection(BaseModel):
    institution: str | None = None
    degree: str | None = None
    field_of_study: str | None = None
    start_year: int | None = None
    end_year: int | None = None


class WorkCorrection(BaseModel):
    company: str | None = None
    title: str | None = None
    start_date: str | None = None  # "YYYY" or "YYYY-MM"
    end_date: str | None = None
    description: str | None = None


class ParsedResumeCorrection(BaseModel):
    full_name: str | None = Field(default=None)
    email: str | None = Field(default=None)
    phone: str | None = Field(default=None)
    top_institution: str | None = Field(default=None)
    top_degree: str | None = Field(default=None)
    skills: list[str] | None = Field(default=None)
    education: list[EducationCorrection] | None = Field(default=None)
    work: list[WorkCorrection] | None = Field(default=None)


