"""Outbound webhook delivery for stage-transition integrations.

Each webhook call:
  1. Builds a JSON payload with applicant + job + stage info.
  2. POSTs to the configured endpoint with Authorization: Bearer header.
  3. Records the attempt in WebhookDelivery (success or failure).

Idempotency: each automatic attempt claims its (transition_id, integration_id,
attempt_number) row before sending. A duplicate trigger loses that claim and
exits without sending. Manual retries use is_manual_retry=True and a fresh
attempt number.

Auto-retry: on transient failure (5xx, timeout, network error) the wrapper
`deliver_with_retry` re-fires after 5s, then 30s. Permanent failures (4xx
other than 408/429) are not retried — the receiver explicitly rejected
the payload, so retrying won't help.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import httpx
import structlog
from sqlalchemy.exc import IntegrityError
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
    """Decrypt a stored API key. Raises ValueError on failure.

    Never silently falls back to returning the raw ciphertext — that would
    cause integrations to send the encrypted blob as a Bearer token and fail
    with no actionable error. Callers must handle the ValueError explicitly.
    """
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except Exception as exc:
        log.error(
            "webhook.api_key_decrypt_failed",
            note="ENCRYPTION_SECRET may have changed. Re-save the integration API key to fix.",
        )
        raise ValueError("Failed to decrypt webhook API key") from exc


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

# Auto-retry schedule: initial fire is immediate; on transient failure we wait
# these many seconds before each subsequent attempt. Three total attempts.
_AUTO_RETRY_DELAYS_SECONDS = (5, 30)


def _is_transient_status(status_code: int) -> bool:
    """Return True if a non-2xx response should be retried.

    5xx are server errors (worth retrying). 408 (timeout) and 429 (rate-limited)
    are explicitly retryable. Everything else in 4xx means the receiver
    rejected the payload — retrying won't help.
    """
    if status_code >= 500:
        return True
    if status_code in (408, 429):
        return True
    return False


def fire_webhook(
    *,
    transition_id: UUID,
    integration_id: UUID,
    is_manual_retry: bool = False,
    attempt_number: int | None = None,
) -> tuple[bool, bool]:
    """Deliver the webhook synchronously. Records one WebhookDelivery row.

    Returns:
        (success, is_transient) — `is_transient` is only meaningful when
        success is False, and indicates whether an auto-retry would be
        worthwhile.
    """
    with Session(engine) as session:
        transition = session.get(StageTransition, transition_id)
        integration = session.get(JobIntegration, integration_id)

        if not transition or not integration or not integration.is_active:
            return True, False  # nothing to do; treat as success

        if attempt_number is None:
            if is_manual_retry:
                existing = session.execute(
                    select(WebhookDelivery).where(
                        WebhookDelivery.transition_id == transition_id,
                        WebhookDelivery.integration_id == integration_id,
                    )
                ).scalars().all()
                attempt_number = max((d.attempt_number for d in existing), default=0) + 1
            else:
                attempt_number = 1

        payload = _build_payload(session, transition, integration)

        # Decrypt API key — treat failure as a permanent (non-retriable) error
        # so we don't spam the third party with the raw ciphertext.
        try:
            api_key = decrypt_api_key(integration.api_key_encrypted)
        except ValueError:
            log.error(
                "webhook.api_key_decrypt_failed",
                integration_id=str(integration_id),
                note="Re-save the integration API key to re-encrypt with the current key.",
            )
            # Record the failure so admins can see it in the delivery log.
            bad_delivery = WebhookDelivery(
                transition_id=transition_id,
                integration_id=integration_id,
                attempt_number=attempt_number,
                is_manual_retry=is_manual_retry,
                request_payload=payload,
                error="API key decryption failed — re-save the integration to fix.",
            )
            session.add(bad_delivery)
            try:
                session.commit()
            except Exception:
                session.rollback()
            return False, False  # permanent failure, don't retry

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
            return False, False  # SSRF block is permanent

        delivery = WebhookDelivery(
            transition_id=transition_id,
            integration_id=integration_id,
            attempt_number=attempt_number,
            is_manual_retry=is_manual_retry,
            request_payload=payload,
        )
        session.add(delivery)
        try:
            session.commit()
            session.refresh(delivery)
        except IntegrityError:
            session.rollback()
            log.info(
                "webhook.duplicate_attempt_skipped",
                transition_id=str(transition_id),
                integration_id=str(integration_id),
                attempt=attempt_number,
            )
            return True, False

        success = False
        is_transient = False
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
            success = 200 <= resp.status_code < 300
            is_transient = (not success) and _is_transient_status(resp.status_code)
            log.info(
                "webhook.delivered",
                integration_id=str(integration_id),
                status=resp.status_code,
                attempt=attempt_number,
            )
        except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError) as exc:
            # Transport-layer failures are always retryable
            delivery.error = traceback.format_exc()[-1900:]
            is_transient = True
            log.warning(
                "webhook.transient_error",
                integration_id=str(integration_id),
                attempt=attempt_number,
                error=str(exc),
            )
        except Exception as exc:
            delivery.error = traceback.format_exc()[-1900:]
            log.warning(
                "webhook.failed",
                integration_id=str(integration_id),
                attempt=attempt_number,
                error=str(exc),
            )

        session.add(delivery)
        session.commit()

        return success, is_transient


async def deliver_with_retry(
    *,
    transition_id: UUID,
    integration_id: UUID,
) -> None:
    """BackgroundTask entry point: initial fire + transient-failure auto-retries.

    Declared async so FastAPI's BackgroundTasks runs it as a coroutine — retries
    use asyncio.sleep instead of time.sleep, so the event loop is never blocked
    during the 5s / 30s wait between attempts.

    Manual admin retries call `fire_webhook` directly (no auto-retry chain) so
    the admin remains in control.
    """
    success, is_transient = fire_webhook(
        transition_id=transition_id,
        integration_id=integration_id,
        is_manual_retry=False,
        attempt_number=1,
    )
    if success:
        return

    for attempt_number, delay_s in enumerate(_AUTO_RETRY_DELAYS_SECONDS, start=2):
        if not is_transient:
            return  # permanent failure — stop retrying
        await asyncio.sleep(delay_s)
        success, is_transient = fire_webhook(
            transition_id=transition_id,
            integration_id=integration_id,
            is_manual_retry=False,
            attempt_number=attempt_number,
        )
        if success:
            return

    log.warning(
        "webhook.auto_retry_exhausted",
        transition_id=str(transition_id),
        integration_id=str(integration_id),
    )


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
