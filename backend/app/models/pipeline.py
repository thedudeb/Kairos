"""Per-job pipeline stages and stage transitions."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Column, DateTime, func
from sqlmodel import Field, SQLModel

from app.models._base import uuid_pk


class PipelineStage(SQLModel, table=True):
    __tablename__ = "pipeline_stages"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    job_id: UUID = Field(foreign_key="jobs.id", nullable=False, index=True)
    name: str = Field(max_length=100)
    sort_order: int = Field(default=0)
    is_terminal: bool = Field(default=False)


class StageTransition(SQLModel, table=True):
    """One row per stage move. The `id` here is the `transition_id` used as the
    idempotency key for outbound webhook deliveries."""

    __tablename__ = "stage_transitions"

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    applicant_id: UUID = Field(foreign_key="applicants.id", nullable=False, index=True)
    from_stage_id: UUID | None = Field(default=None, foreign_key="pipeline_stages.id")
    to_stage_id: UUID = Field(foreign_key="pipeline_stages.id", nullable=False)
    actor_id: UUID | None = Field(default=None, foreign_key="users.id")
    notes: str | None = Field(default=None, max_length=1000)
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
