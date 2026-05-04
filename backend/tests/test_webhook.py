"""Tests for outbound webhook delivery.

Covers: idempotency (DB unique constraint), payload structure (with and without
assessment questions), permanent vs. transient failure classification, and
SSRF URL validation.
"""
from __future__ import annotations

from unittest.mock import Mock, patch

import pytest
from sqlmodel import Session, select

from app.models.integration import JobIntegration, WebhookDelivery
from app.models.job import Job, JobAssessmentQuestion
from app.models.pipeline import PipelineStage, StageTransition
from app.models.applicant import Applicant
from app.services import webhook as webhook_svc
from app.services.webhook import encrypt_api_key, fire_webhook
from app.utils.url import assert_safe_webhook_url
from tests.conftest import make_applicant, make_job


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture()
def webhook_engine(engine):
    """Point the webhook service at the test engine for the duration of the test."""
    original = webhook_svc.engine
    webhook_svc.engine = engine
    yield engine
    webhook_svc.engine = original


def _seed_webhook_scenario(session, *, include_assessment: bool = False):
    """Create the minimum rows needed to deliver a webhook. Returns IDs."""
    job = Job(
        title="Engineer",
        slug="engineer",
        description_md="Role description.",
    )
    session.add(job)
    session.flush()

    stage = PipelineStage(job_id=job.id, name="Assessment", sort_order=0)
    session.add(stage)
    session.flush()

    applicant = Applicant(
        job_id=job.id,
        current_stage_id=stage.id,
        first_name="Jane",
        last_name="Doe",
        email="jane@example.com",
        phone="555-0100",
        resume_gcs_path="local:///tmp/resume.pdf",
    )
    session.add(applicant)
    session.flush()

    transition = StageTransition(
        applicant_id=applicant.id,
        to_stage_id=stage.id,
    )
    session.add(transition)
    session.flush()

    integration = JobIntegration(
        job_id=job.id,
        stage_id=stage.id,
        endpoint_url="https://example.com/webhook",
        api_key_encrypted=encrypt_api_key("secret-key"),
        include_assessment=include_assessment,
        is_active=True,
    )
    session.add(integration)

    if include_assessment:
        session.add(
            JobAssessmentQuestion(
                job_id=job.id,
                question_text="Tell us about a project.",
                max_duration_seconds=120,
                max_attempts=2,
                sort_order=0,
            )
        )

    session.commit()
    return transition.id, integration.id


# ─── Idempotency ──────────────────────────────────────────────────────────────

def test_fire_webhook_idempotency_sends_once(session, webhook_engine):
    """Calling fire_webhook twice with the same attempt_number must only POST once.

    The DB unique constraint on (transition_id, integration_id, attempt_number)
    makes the second call a no-op — no HTTP request is made.
    """
    transition_id, integration_id = _seed_webhook_scenario(session)
    mock_resp = Mock(status_code=200, text="ok")

    with patch("app.services.webhook.httpx.post", return_value=mock_resp) as mock_post:
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

    assert mock_post.call_count == 1


def test_fire_webhook_different_attempt_numbers_both_sent(session, webhook_engine):
    """Different attempt numbers are independent — both should fire."""
    transition_id, integration_id = _seed_webhook_scenario(session)
    mock_resp = Mock(status_code=200, text="ok")

    with patch("app.services.webhook.httpx.post", return_value=mock_resp) as mock_post:
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=2)

    assert mock_post.call_count == 2


def test_delivery_row_created_in_db(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    mock_resp = Mock(status_code=200, text="ok")

    with patch("app.services.webhook.httpx.post", return_value=mock_resp):
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

    deliveries = session.exec(
        select(WebhookDelivery).where(WebhookDelivery.transition_id == transition_id)
    ).all()
    assert len(deliveries) == 1
    assert deliveries[0].response_status == 200


# ─── Payload structure ────────────────────────────────────────────────────────

def test_webhook_payload_contains_required_top_level_keys(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    captured = {}

    def _capture(url, json, **kwargs):
        captured.update(json)
        return Mock(status_code=200, text="ok")

    with patch("app.services.webhook.httpx.post", side_effect=_capture):
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

    assert "event" in captured
    assert "timestamp" in captured
    assert "candidate" in captured
    assert "stage" in captured
    assert "job" in captured


def test_webhook_payload_event_is_stage_transition(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    captured = {}

    with patch("app.services.webhook.httpx.post", side_effect=lambda url, json, **kw: (captured.update(json), Mock(status_code=200, text="ok"))[1]):
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

    assert captured["event"] == "stage_transition"


def test_webhook_payload_candidate_fields(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    captured = {}

    with patch("app.services.webhook.httpx.post", side_effect=lambda url, json, **kw: (captured.update(json), Mock(status_code=200, text="ok"))[1]):
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

    candidate = captured["candidate"]
    assert candidate["name"] == "Jane Doe"
    assert candidate["email"] == "jane@example.com"
    assert candidate["phone"] == "555-0100"
    assert "id" in candidate


def test_webhook_payload_excludes_assessment_when_disabled(session, webhook_engine):
    """include_assessment=False → no 'assessment' key in payload."""
    transition_id, integration_id = _seed_webhook_scenario(session, include_assessment=False)
    captured = {}

    with patch("app.services.webhook.httpx.post", side_effect=lambda url, json, **kw: (captured.update(json), Mock(status_code=200, text="ok"))[1]):
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

    assert "assessment" not in captured


def test_webhook_payload_includes_assessment_when_enabled(session, webhook_engine):
    """include_assessment=True with questions → 'assessment' block present."""
    transition_id, integration_id = _seed_webhook_scenario(session, include_assessment=True)
    captured = {}

    with patch("app.services.webhook.httpx.post", side_effect=lambda url, json, **kw: (captured.update(json), Mock(status_code=200, text="ok"))[1]):
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

    assert "assessment" in captured
    assessment = captured["assessment"]
    assert "questions" in assessment
    assert len(assessment["questions"]) == 1
    q = assessment["questions"][0]
    assert q["text"] == "Tell us about a project."
    assert q["maxDurationSeconds"] == 120
    assert q["maxAttempts"] == 2


def test_webhook_request_includes_authorization_header(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    captured_headers = {}

    def _capture(url, json, headers=None, **kwargs):
        if headers:
            captured_headers.update(headers)
        return Mock(status_code=200, text="ok")

    with patch("app.services.webhook.httpx.post", side_effect=_capture):
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

    assert "Authorization" in captured_headers
    assert captured_headers["Authorization"].startswith("Bearer ")


def test_webhook_request_includes_transition_id_header(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    captured_headers = {}

    def _capture(url, json, headers=None, **kwargs):
        if headers:
            captured_headers.update(headers)
        return Mock(status_code=200, text="ok")

    with patch("app.services.webhook.httpx.post", side_effect=_capture):
        fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

    assert "X-Transition-ID" in captured_headers
    assert captured_headers["X-Transition-ID"] == str(transition_id)


# ─── Failure classification ───────────────────────────────────────────────────

def test_permanent_4xx_failure_not_transient(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    mock_resp = Mock(status_code=400, text="bad request")

    with patch("app.services.webhook.httpx.post", return_value=mock_resp):
        success, is_transient = fire_webhook(
            transition_id=transition_id, integration_id=integration_id, attempt_number=1
        )

    assert success is False
    assert is_transient is False


def test_5xx_failure_is_transient(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    mock_resp = Mock(status_code=503, text="service unavailable")

    with patch("app.services.webhook.httpx.post", return_value=mock_resp):
        success, is_transient = fire_webhook(
            transition_id=transition_id, integration_id=integration_id, attempt_number=1
        )

    assert success is False
    assert is_transient is True


def test_rate_limited_429_is_transient(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    mock_resp = Mock(status_code=429, text="too many requests")

    with patch("app.services.webhook.httpx.post", return_value=mock_resp):
        _, is_transient = fire_webhook(
            transition_id=transition_id, integration_id=integration_id, attempt_number=1
        )

    assert is_transient is True


def test_successful_delivery_returns_true(session, webhook_engine):
    transition_id, integration_id = _seed_webhook_scenario(session)
    mock_resp = Mock(status_code=200, text="ok")

    with patch("app.services.webhook.httpx.post", return_value=mock_resp):
        success, _ = fire_webhook(
            transition_id=transition_id, integration_id=integration_id, attempt_number=1
        )

    assert success is True


# ─── SSRF / URL validation ────────────────────────────────────────────────────

def test_production_rejects_http_url():
    original = webhook_svc.settings.environment
    webhook_svc.settings.environment = "production"
    try:
        with pytest.raises(ValueError, match="HTTPS"):
            assert_safe_webhook_url("http://example.com/hook")
    finally:
        webhook_svc.settings.environment = original


def test_production_rejects_private_ip():
    original = webhook_svc.settings.environment
    webhook_svc.settings.environment = "production"
    try:
        with pytest.raises(ValueError, match="private or reserved"):
            assert_safe_webhook_url("https://192.168.1.1/hook")
    finally:
        webhook_svc.settings.environment = original


def test_production_rejects_localhost():
    original = webhook_svc.settings.environment
    webhook_svc.settings.environment = "production"
    try:
        with pytest.raises(ValueError, match="private or reserved"):
            assert_safe_webhook_url("https://localhost/hook")
    finally:
        webhook_svc.settings.environment = original
