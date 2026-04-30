"""Outbound webhook delivery for stage-transition integrations.

Each webhook call:
  1. Builds a JSON payload with applicant + job + stage info.
  2. POSTs to the configured endpoint with Authorization: Bearer header.
  3. Records the attempt in WebhookDelivery (success or failure).

Idempotency: the unique constraint (transition_id, integration_id, attempt_number)
prevents double-firing. Manual retries use is_manual_retry=True and a fresh
attempt number.
"""
from __future__ import annotations

import base64
import hashlib
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import httpx
import structlog
from sqlmodel import Session, select

from app.config import settings
from app.db import engine
from app.models.applicant import Applicant
from app.utils.url import assert_safe_webhook_url
from app.models.integration import JobIntegration, WebhookDelivery
from app.models.job import Job, JobAssessmentQuestion
from app.models.pipeline import PipelineStage, StageTransition
from app.models.template import Template
from app.services import storage as storage_svc

log = structlog.get_logger()

_WEBHOOK_TIMEOUT = 10  # seconds


# ─── API key encryption ────────────────────────────────────────────────────────

def _fernet():
    from cryptography.fernet import Fernet

    # Use a dedicated ENCRYPTION_SECRET when available so it can be rotated
    # independently from the JWT signing secret (auth_secret).
    if not settings.encryption_secret:
        log.warning(
            "webhook.encryption_secret_missing",
            note="Set ENCRYPTION_SECRET env var; currently falling back to AUTH_SECRET. "
                 "Rotating AUTH_SECRET will break decryption of stored webhook API keys.",
        )
    secret = settings.encryption_secret or settings.auth_secret
    key = hashlib.sha256(secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_api_key(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except Exception:
        return encrypted  # fallback: treat as plaintext (legacy)


def mask_api_key(encrypted: str) -> str:
    """Return ****xxxx for UI display."""
    try:
        plain = decrypt_api_key(encrypted)
        if len(plain) <= 4:
            return "****"
        return "****" + plain[-4:]
    except Exception:
        return "****"


# ─── Payload builder ──────────────────────────────────────────────────────────

def _build_payload(
    session: Session,
    transition: StageTransition,
    integration: JobIntegration,
) -> dict[str, Any]:
    applicant = session.get(Applicant, transition.applicant_id)
    job = session.get(Job, integration.job_id)
    to_stage = session.get(PipelineStage, transition.to_stage_id)

    full_name = (
        f"{applicant.first_name} {applicant.last_name}".strip() if applicant else None
    )

    payload: dict[str, Any] = {
        "event": "stage_transition",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "candidate": {
            "id": str(applicant.id) if applicant else None,
            "name": full_name,
            "email": applicant.email if applicant else None,
            "phone": applicant.phone if applicant else None,
            "resumeUrl": storage_svc.get_download_url(applicant.resume_gcs_path)
            if applicant
            else None,
        },
        "stage": {
            "id": str(to_stage.id) if to_stage else None,
            "name": to_stage.name if to_stage else None,
        },
        "job": {
            "id": str(job.id) if job else None,
            "title": job.title if job else None,
            "slug": job.slug if job else None,
        },
    }

    if integration.include_assessment and job:
        questions = session.exec(
            select(JobAssessmentQuestion)
            .where(JobAssessmentQuestion.job_id == job.id)
            .order_by(JobAssessmentQuestion.sort_order)
        ).all()

        if questions:
            template = session.get(Template, job.template_id) if job.template_id else None
            template_name = template.name if template else job.title
            template_description = template.description if (template and template.description) else None

            assessment_block: dict[str, Any] = {
                "title": template_name,
                "questions": [
                    {
                        "text": q.question_text,
                        "maxDurationSeconds": q.max_duration_seconds,
                        "maxAttempts": q.max_attempts,
                    }
                    for q in questions
                ],
            }
            if template_description:
                assessment_block["description"] = template_description

            payload["assessment"] = assessment_block

    return payload


# ─── Delivery ─────────────────────────────────────────────────────────────────

def fire_webhook(
    *,
    transition_id: UUID,
    integration_id: UUID,
    is_manual_retry: bool = False,
) -> None:
    """Deliver the webhook synchronously (called from a background task)."""
    with Session(engine) as session:
        transition = session.get(StageTransition, transition_id)
        integration = session.get(JobIntegration, integration_id)

        if not transition or not integration or not integration.is_active:
            return

        # Determine attempt number
        existing = session.execute(
            select(WebhookDelivery)
            .where(
                WebhookDelivery.transition_id == transition_id,
                WebhookDelivery.integration_id == integration_id,
            )
        ).scalars().all()
        attempt_number = max((d.attempt_number for d in existing), default=0) + 1

        payload = _build_payload(session, transition, integration)
        api_key = decrypt_api_key(integration.api_key_encrypted)

        # Re-validate URL at delivery time to prevent DNS-rebinding attacks
        # (the URL was checked at creation time, but DNS may have changed).
        try:
            assert_safe_webhook_url(integration.endpoint_url)
        except ValueError as exc:
            log.warning(
                "webhook.ssrf_blocked",
                integration_id=str(integration_id),
                url=integration.endpoint_url,
                reason=str(exc),
            )
            return

        delivery = WebhookDelivery(
            transition_id=transition_id,
            integration_id=integration_id,
            attempt_number=attempt_number,
            is_manual_retry=is_manual_retry,
            request_payload=payload,
        )

        try:
            resp = httpx.post(
                integration.endpoint_url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "X-Transition-ID": str(transition_id),
                },
                timeout=_WEBHOOK_TIMEOUT,
            )
            delivery.response_status = resp.status_code
            delivery.response_body = resp.text[:2000]
            log.info(
                "webhook.delivered",
                integration_id=str(integration_id),
                status=resp.status_code,
            )
        except Exception as exc:
            delivery.error = traceback.format_exc()[-1900:]
            log.warning(
                "webhook.failed",
                integration_id=str(integration_id),
                error=str(exc),
            )

        session.add(delivery)
        session.commit()


def trigger_integrations_for_transition(
    session: Session,
    transition_id: UUID,
    job_id: UUID,
    to_stage_id: UUID,
) -> list[UUID]:
    """Return integration IDs to fire (caller schedules as background tasks)."""
    integrations = session.exec(
        select(JobIntegration).where(
            JobIntegration.job_id == job_id,
            JobIntegration.stage_id == to_stage_id,
            JobIntegration.is_active == True,  # noqa: E712
        )
    ).all()
    return [i.id for i in integrations]
