from __future__ import annotations

import os
import unittest
from unittest.mock import Mock, patch

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("REDIS_URL", "memory://")
os.environ.setdefault("AUTH_SECRET", "test-auth-secret-test-auth-secret")
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key-test-internal-key")
os.environ.setdefault("INITIAL_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("ENVIRONMENT", "test")

from fastapi.testclient import TestClient
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import app.models  # noqa: F401
from app.db import get_session
from app.main import app
from app.models._base import FieldType, JobStatus
from app.models.applicant import Applicant
from app.models.integration import JobIntegration
from app.models.job import Job, JobFormField
from app.models.pipeline import PipelineStage, StageTransition
from app.models.template import Template, TemplateAssessmentQuestion, TemplateFormField
from app.routers.templates import update_template
from app.routers.jobs import delete_job
from app.schemas.template import TemplateFormFieldIn, TemplateUpdate
from app.services import storage as storage_svc
from app.services import webhook as webhook_svc
from app.services.webhook import deliver_with_retry, encrypt_api_key, fire_webhook
from app.utils.slug import unique_job_slug
from app.utils.url import assert_safe_webhook_url


class RegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self._old_gcs_bucket = storage_svc.settings.gcs_bucket
        storage_svc.settings.gcs_bucket = None

    def tearDown(self) -> None:
        storage_svc.settings.gcs_bucket = self._old_gcs_bucket
        app.dependency_overrides.clear()

    def _session_override(self):
        def _override():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_session] = _override

    def test_unique_job_slug_generates_suffix(self) -> None:
        with Session(self.engine) as session:
            session.add(Job(title="Full Stack Engineer", slug="full-stack-engineer"))
            session.commit()

            self.assertEqual(
                unique_job_slug(session, "Full Stack Engineer"),
                "full-stack-engineer-2",
            )

    def test_public_apply_rejects_missing_required_custom_field(self) -> None:
        with Session(self.engine) as session:
            job = Job(
                title="QA Analyst",
                slug="qa-analyst",
                status=JobStatus.active,
                description_md="Test role",
            )
            session.add(job)
            session.flush()
            session.add(PipelineStage(job_id=job.id, name="Applied", sort_order=0))
            session.add(
                JobFormField(
                    job_id=job.id,
                    label="Work authorization",
                    field_type=FieldType.text,
                    is_required=True,
                    sort_order=0,
                )
            )
            session.commit()

        self._session_override()
        with TestClient(app) as client:
            response = client.post(
                "/public/jobs/qa-analyst/apply",
                data={
                    "first_name": "Jane",
                    "last_name": "Doe",
                    "email": "jane@example.com",
                    "phone": "555-0100",
                },
                files={"resume": ("resume.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
            )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"], "Work authorization is required.")

    def test_public_apply_rejects_invalid_dropdown_option(self) -> None:
        with Session(self.engine) as session:
            job = Job(
                title="Designer",
                slug="designer",
                status=JobStatus.active,
                description_md="Test role",
            )
            session.add(job)
            session.flush()
            session.add(PipelineStage(job_id=job.id, name="Applied", sort_order=0))
            field = JobFormField(
                job_id=job.id,
                label="How did you hear about us?",
                field_type=FieldType.dropdown,
                is_required=False,
                options=["LinkedIn", "Referral"],
                sort_order=0,
            )
            session.add(field)
            session.commit()
            field_id = str(field.id)

        self._session_override()
        with TestClient(app) as client:
            response = client.post(
                "/public/jobs/designer/apply",
                data={
                    "first_name": "Jane",
                    "last_name": "Doe",
                    "email": "jane@example.com",
                    "phone": "555-0100",
                    f"custom_{field_id}": "Search engine",
                },
                files={"resume": ("resume.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
            )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json()["detail"],
            "Invalid option selected for How did you hear about us?.",
        )

    def test_webhook_duplicate_automatic_delivery_sends_once(self) -> None:
        original_engine = webhook_svc.engine
        webhook_svc.engine = self.engine
        try:
            with Session(self.engine) as session:
                job = Job(
                    title="Engineer",
                    slug="engineer",
                    status=JobStatus.active,
                    description_md="Test role",
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
                    resume_gcs_path="local:///tmp/nonexistent.pdf",
                )
                session.add(applicant)
                session.flush()
                transition = StageTransition(
                    applicant_id=applicant.id,
                    from_stage_id=None,
                    to_stage_id=stage.id,
                    actor_id=None,
                )
                integration = JobIntegration(
                    job_id=job.id,
                    stage_id=stage.id,
                    endpoint_url="https://example.com/webhook",
                    api_key_encrypted=encrypt_api_key("secret"),
                    include_assessment=False,
                    is_active=True,
                )
                session.add(transition)
                session.add(integration)
                session.commit()
                transition_id = transition.id
                integration_id = integration.id

            response = Mock(status_code=200, text="ok")
            with patch("app.services.webhook.httpx.post", return_value=response) as post:
                # fire_webhook is the sync delivery primitive; calling it twice
                # with the same (transition, integration, attempt_number) must
                # result in only one outbound HTTP POST due to the DB unique
                # constraint on (transition_id, integration_id, attempt_number).
                fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)
                fire_webhook(transition_id=transition_id, integration_id=integration_id, attempt_number=1)

            self.assertEqual(post.call_count, 1)
        finally:
            webhook_svc.engine = original_engine

    def test_production_webhook_url_requires_https_and_public_host(self) -> None:
        old_env = webhook_svc.settings.environment
        webhook_svc.settings.environment = "production"
        try:
            with self.assertRaisesRegex(ValueError, "HTTPS"):
                assert_safe_webhook_url("http://example.com/webhook")
            with self.assertRaisesRegex(ValueError, "private or reserved"):
                assert_safe_webhook_url("https://127.0.0.1/webhook")
        finally:
            webhook_svc.settings.environment = old_env

    def test_template_update_preserves_omitted_assessment_questions(self) -> None:
        with Session(self.engine) as session:
            template = Template(name="Engineer")
            session.add(template)
            session.flush()
            question = TemplateAssessmentQuestion(
                template_id=template.id,
                question_text="Tell us about a system you designed.",
                max_attempts=1,
                sort_order=0,
            )
            session.add(question)
            session.add(
                TemplateFormField(
                    template_id=template.id,
                    label="Portfolio",
                    field_type=FieldType.url,
                    is_required=False,
                    sort_order=0,
                )
            )
            session.commit()
            template_id = template.id

            result = update_template(
                template_id,
                TemplateUpdate(
                    form_fields=[
                        TemplateFormFieldIn(
                            label="LinkedIn",
                            field_type=FieldType.url,
                            is_required=False,
                        )
                    ],
                ),
                session,
                object(),
            )

            self.assertEqual([q.question_text for q in result.assessment_questions], [question.question_text])
            self.assertEqual([f.label for f in result.form_fields], ["LinkedIn"])

    def test_delete_job_with_applicants_is_rejected(self) -> None:
        with Session(self.engine) as session:
            job = Job(
                title="Engineer",
                slug="engineer",
                status=JobStatus.active,
                description_md="Test role",
            )
            session.add(job)
            session.flush()
            stage = PipelineStage(job_id=job.id, name="Applied", sort_order=0)
            session.add(stage)
            session.flush()
            session.add(
                Applicant(
                    job_id=job.id,
                    current_stage_id=stage.id,
                    first_name="Jane",
                    last_name="Doe",
                    email="jane@example.com",
                    phone="555-0100",
                    resume_gcs_path="local:///tmp/resume.pdf",
                )
            )
            session.commit()

            with self.assertRaises(HTTPException) as raised:
                delete_job(job.id, session, object())

            self.assertEqual(raised.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
