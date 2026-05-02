"""External webhook integrations and delivery log."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import JSON, Column, DateTime, UniqueConstraint, func
from sqlmodel import Field, SQLModel

from app.models._base import TimestampMixin, uuid_pk


class JobIntegration(TimestampMixin, SQLModel, table=True):
    """One integration = one (job, stage) combination with a destination URL.

    A single stage can have one integration; multiple stages within a job can
    each have their own.
    """

    __tablename__ = "job_integrations"
    __table_args__ = (
        UniqueConstraint("job_id", "stage_id", name="uq_job_integration_job_stage"),
    )

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    job_id: UUID = Field(foreign_key="jobs.id", nullable=False, index=True)
    stage_id: UUID = Field(foreign_key="pipeline_stages.id", nullable=False)
    endpoint_url: str = Field(max_length=2048)
    api_key_encrypted: str = Field(max_length=2048)
    include_assessment: bool = Field(default=True)
    is_active: bool = Field(default=True)


class WebhookDelivery(SQLModel, table=True):
    """One row per outbound webhook attempt.

    Idempotency: automatic senders claim a numbered attempt before making the
    HTTP call. The unique constraint on (transition_id, integration_id,
    attempt_number) prevents the same trigger attempt from firing twice. Manual
    admin retries deliberately use a fresh attempt_number with
    is_manual_retry=true.
    """

    __tablename__ = "webhook_deliveries"
    __table_args__ = (
        UniqueConstraint(
            "transition_id",
            "integration_id",
            "attempt_number",
            name="uq_webhook_delivery_idempotency",
        ),
    )

    id: UUID = Field(default_factory=uuid_pk, primary_key=True)
    transition_id: UUID = Field(foreign_key="stage_transitions.id", nullable=False, index=True)
    integration_id: UUID = Field(foreign_key="job_integrations.id", nullable=False, index=True)
    attempt_number: int = Field(default=1)
    is_manual_retry: bool = Field(default=False)

    request_payload: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False),
    )
    response_status: int | None = Field(default=None)
    response_body: str | None = Field(default=None)
    error: str | None = Field(default=None)

    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )
