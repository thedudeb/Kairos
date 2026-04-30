from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models._base import FieldType


class TemplateFormFieldIn(BaseModel):
    label: str = Field(max_length=200)
    field_type: FieldType
    is_required: bool = False
    options: list[str] | None = None
    sort_order: int = 0


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


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    form_fields: list[TemplateFormFieldIn] | None = None
    assessment_questions: list[TemplateAssessmentQuestionIn] | None = None


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
