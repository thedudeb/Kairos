"""Reusable hiring templates: bundle of custom form fields + assessment questions."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.models._base import FieldType, TimestampMixin, uuid_pk


class Template(TimestampMixin, SQLModel, table=True):
    __tablename__ = "templates"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    name: str = Field(max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class TemplateFormField(SQLModel, table=True):
    __tablename__ = "template_form_fields"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    template_id: UUID = Field(foreign_key="templates.id", nullable=False, index=True)
    label: str = Field(max_length=200)
    field_type: FieldType
    is_required: bool = Field(default=False)
    options: list[str] | None = Field(
        default=None,
        sa_column=Column(JSON, nullable=True),
    )
    sort_order: int = Field(default=0)


class TemplateAssessmentQuestion(SQLModel, table=True):
    __tablename__ = "template_assessment_questions"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    template_id: UUID = Field(foreign_key="templates.id", nullable=False, index=True)
    question_text: str = Field(max_length=2000)
    max_duration_seconds: int | None = Field(default=None)
    max_attempts: int = Field(default=1)
    sort_order: int = Field(default=0)
