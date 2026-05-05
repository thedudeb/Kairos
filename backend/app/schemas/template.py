from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models._base import FieldType
from app.schemas.job import _validate_file_mimes


class TemplateFormFieldIn(BaseModel):
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


class TemplateFormFieldOut(TemplateFormFieldIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class TemplateAssessmentQuestionIn(BaseModel):
    question_text: str = Field(max_length=2000)
    max_duration_seconds: int | None = None
    max_attempts: int = Field(default=1, ge=1)
    sort_order: int = 0


class TemplateAssessmentQuestionOut(TemplateAssessmentQuestionIn):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class TemplateCreate(BaseModel):
    name: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    form_fields: list[TemplateFormFieldIn] = []
    assessment_questions: list[TemplateAssessmentQuestionIn] = []

    # Assessment questions are optional — some roles do not require a structured
    # assessment payload (e.g. internships, ops roles). An empty list is valid.


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    form_fields: list[TemplateFormFieldIn] | None = None
    assessment_questions: list[TemplateAssessmentQuestionIn] | None = None

    @field_validator("assessment_questions")
    @classmethod
    def _require_at_least_one_question(
        cls, v: list[TemplateAssessmentQuestionIn] | None
    ) -> list[TemplateAssessmentQuestionIn] | None:
        if v is not None and len(v) < 1:
            raise ValueError("A template must have at least one assessment question.")
        return v


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    form_fields: list[TemplateFormFieldOut]
    assessment_questions: list[TemplateAssessmentQuestionOut]


class TemplateSummary(BaseModel):
    """Lightweight representation for selection dropdowns."""
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str | None
