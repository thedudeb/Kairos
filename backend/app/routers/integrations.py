"""Job integration CRUD + webhook delivery log."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import httpx
import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import case, func, or_
from sqlmodel import Session, select

from app.utils.url import assert_safe_webhook_url

from app.db import get_session
from app.models.integration import JobIntegration, WebhookDelivery
from app.models.job import Job
from app.models.pipeline import PipelineStage
from app.security import require_admin, require_staff
from app.models.user import User
from app.services.webhook import (
    decrypt_api_key,
    encrypt_api_key,
    fire_webhook,
    mask_api_key,
)

log = structlog.get_logger()

router = APIRouter(prefix="/jobs/{job_id}/integrations", tags=["integrations"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class IntegrationOut(BaseModel):
    id: UUID
    job_id: UUID
    stage_id: UUID
    stage_name: str
    endpoint_url: str
    api_key_masked: str
    include_assessment: bool
    is_active: bool
    last_success_at: str | None = None
    last_failure_at: str | None = None
    failure_delivery_count: int = 0


class IntegrationCreate(BaseModel):
    stage_id: UUID
    endpoint_url: str
    api_key: str
    include_assessment: bool = True
    is_active: bool = True

    @field_validator("endpoint_url")
    @classmethod
    def validate_endpoint_url(cls, v: str) -> str:
        assert_safe_webhook_url(v)
        return v


class IntegrationUpdate(BaseModel):
    endpoint_url: str | None = None
    api_key: str | None = None
    include_assessment: bool | None = None
    is_active: bool | None = None

    @field_validator("endpoint_url")
    @classmethod
    def validate_endpoint_url(cls, v: str | None) -> str | None:
        if v is not None:
            assert_safe_webhook_url(v)
        return v


class DeliveryOut(BaseModel):
    id: UUID
    transition_id: UUID
    integration_id: UUID
    attempt_number: int
    is_manual_retry: bool
    response_status: int | None
    response_body: str | None
    error: str | None
    created_at: str
    success: bool


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_job_or_404(session: Session, job_id: UUID) -> Job:
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


def _fetch_delivery_stats(session: Session, integration_ids: list[UUID]) -> dict[UUID, tuple]:
    """Per-integration last success, last failure timestamps, and failed delivery count."""
    if not integration_ids:
        return {}
    succ = (
        WebhookDelivery.response_status.is_not(None)
        & (WebhookDelivery.response_status >= 200)
        & (WebhookDelivery.response_status < 300)
    )
    fail = or_(
        WebhookDelivery.response_status.is_(None),
        WebhookDelivery.response_status < 200,
        WebhookDelivery.response_status >= 300,
    )
    rows = session.execute(
        select(
            WebhookDelivery.integration_id,
            func.max(case((succ, WebhookDelivery.created_at))).label("last_ok"),
            func.max(case((fail, WebhookDelivery.created_at))).label("last_bad"),
            func.coalesce(func.sum(case((fail, 1), else_=0)), 0).label("fail_n"),
        )
        .where(WebhookDelivery.integration_id.in_(integration_ids))
        .group_by(WebhookDelivery.integration_id)
    ).all()
    out: dict[UUID, tuple] = {}
    for r in rows:
        out[r.integration_id] = (r.last_ok, r.last_bad, int(r.fail_n or 0))
    return out


def _to_out(
    session: Session,
    integ: JobIntegration,
    stats: tuple | None = None,
) -> IntegrationOut:
    stage = session.get(PipelineStage, integ.stage_id)
    last_ok, last_bad, fail_n = stats if stats else (None, None, 0)
    return IntegrationOut(
        id=integ.id,
        job_id=integ.job_id,
        stage_id=integ.stage_id,
        stage_name=stage.name if stage else "Unknown",
        endpoint_url=integ.endpoint_url,
        api_key_masked=mask_api_key(integ.api_key_encrypted),
        include_assessment=integ.include_assessment,
        is_active=integ.is_active,
        last_success_at=last_ok.isoformat().replace("+00:00", "Z") if last_ok else None,
        last_failure_at=last_bad.isoformat().replace("+00:00", "Z") if last_bad else None,
        failure_delivery_count=fail_n,
    )


# ─── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[IntegrationOut])
def list_integrations(
    job_id: UUID,
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
) -> list[IntegrationOut]:
    _get_job_or_404(session, job_id)
    rows = session.exec(
        select(JobIntegration).where(JobIntegration.job_id == job_id)
    ).all()
    ids = [r.id for r in rows]
    stats_map = _fetch_delivery_stats(session, ids)
    return [_to_out(session, r, stats_map.get(r.id)) for r in rows]


@router.post("", response_model=IntegrationOut, status_code=201)
def create_integration(
    job_id: UUID,
    body: IntegrationCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> IntegrationOut:
    _get_job_or_404(session, job_id)

    # Validate stage belongs to this job
    stage = session.get(PipelineStage, body.stage_id)
    if not stage or stage.job_id != job_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "stage not found for this job")

    integ = JobIntegration(
        job_id=job_id,
        stage_id=body.stage_id,
        endpoint_url=str(body.endpoint_url),
        api_key_encrypted=encrypt_api_key(body.api_key),
        include_assessment=body.include_assessment,
        is_active=body.is_active,
    )
    session.add(integ)
    session.commit()
    session.refresh(integ)
    stats_map = _fetch_delivery_stats(session, [integ.id])
    return _to_out(session, integ, stats_map.get(integ.id))


@router.put("/{integration_id}", response_model=IntegrationOut)
def update_integration(
    job_id: UUID,
    integration_id: UUID,
    body: IntegrationUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> IntegrationOut:
    integ = session.get(JobIntegration, integration_id)
    if not integ or integ.job_id != job_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "integration not found")

    if body.endpoint_url is not None:
        integ.endpoint_url = str(body.endpoint_url)
    if body.api_key is not None:
        integ.api_key_encrypted = encrypt_api_key(body.api_key)
    if body.include_assessment is not None:
        integ.include_assessment = body.include_assessment
    if body.is_active is not None:
        integ.is_active = body.is_active

    session.add(integ)
    session.commit()
    session.refresh(integ)
    stats_map = _fetch_delivery_stats(session, [integ.id])
    return _to_out(session, integ, stats_map.get(integ.id))


@router.delete("/{integration_id}", status_code=204)
def delete_integration(
    job_id: UUID,
    integration_id: UUID,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> None:
    integ = session.get(JobIntegration, integration_id)
    if not integ or integ.job_id != job_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "integration not found")
    session.delete(integ)
    session.commit()


# ─── Delivery log ─────────────────────────────────────────────────────────────

@router.get("/{integration_id}/deliveries", response_model=list[DeliveryOut])
def list_deliveries(
    job_id: UUID,
    integration_id: UUID,
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
) -> list[DeliveryOut]:
    integ = session.get(JobIntegration, integration_id)
    if not integ or integ.job_id != job_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "integration not found")

    rows = session.exec(
        select(WebhookDelivery)
        .where(WebhookDelivery.integration_id == integration_id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(100)
    ).all()

    return [
        DeliveryOut(
            id=r.id,
            transition_id=r.transition_id,
            integration_id=r.integration_id,
            attempt_number=r.attempt_number,
            is_manual_retry=r.is_manual_retry,
            response_status=r.response_status,
            response_body=r.response_body[:500] if r.response_body else None,
            error=r.error[:500] if r.error else None,
            created_at=r.created_at.isoformat(),
            success=r.response_status is not None and 200 <= r.response_status < 300,
        )
        for r in rows
    ]


@router.post("/{integration_id}/test", status_code=200)
def test_integration(
    job_id: UUID,
    integration_id: UUID,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> dict:
    """Fire a sample webhook payload to verify the endpoint is reachable."""
    integ = session.get(JobIntegration, integration_id)
    if not integ or integ.job_id != job_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "integration not found")

    job = _get_job_or_404(session, job_id)
    stage = session.get(PipelineStage, integ.stage_id)

    sample_payload = {
        "event": "stage_transition",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "test": True,
        "candidate": {
            "id": "00000000-0000-0000-0000-000000000000",
            "name": "Jane Sample",
            "email": "jane.sample@example.com",
            "phone": "+1 555-000-0000",
            "resumeUrl": None,
        },
        "stage": {
            "id": str(integ.stage_id),
            "name": stage.name if stage else "Unknown",
        },
        "job": {
            "id": str(job.id),
            "title": job.title,
            "slug": job.slug,
        },
    }

    # Re-validate at call time to prevent DNS-rebinding
    try:
        assert_safe_webhook_url(integ.endpoint_url)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsafe endpoint URL: {exc}") from exc

    api_key = decrypt_api_key(integ.api_key_encrypted)
    try:
        resp = httpx.post(
            integ.endpoint_url,
            json=sample_payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "X-Test": "true",
            },
            timeout=10,
        )
        return {"ok": True, "status": resp.status_code, "body": resp.text[:500]}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.post(
    "/{integration_id}/deliveries/{delivery_id}/retry",
    status_code=202,
)
def retry_delivery(
    job_id: UUID,
    integration_id: UUID,
    delivery_id: UUID,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> dict:
    integ = session.get(JobIntegration, integration_id)
    if not integ or integ.job_id != job_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "integration not found")

    delivery = session.get(WebhookDelivery, delivery_id)
    if not delivery or delivery.integration_id != integration_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "delivery not found")

    background_tasks.add_task(
        fire_webhook,
        transition_id=delivery.transition_id,
        integration_id=integration_id,
        is_manual_retry=True,
    )
    return {"queued": True}
