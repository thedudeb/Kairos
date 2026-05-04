"""Shared pytest fixtures and factory helpers for all test modules.

Env vars are set here (before any app imports) so every test file gets a
consistent in-memory configuration without needing its own boilerplate.
"""
from __future__ import annotations

import os

# Must be set before any app.* import so pydantic-settings picks them up
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("REDIS_URL", "memory://")
os.environ.setdefault("AUTH_SECRET", "test-auth-secret-test-auth-secret-32ch")
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key-test-internal-key")
os.environ.setdefault("INITIAL_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("ENVIRONMENT", "test")

from uuid import UUID  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

import app.models  # noqa: E402, F401  — registers all SQLModel table metadata
from app.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models._base import FieldType, JobStatus, Role  # noqa: E402
from app.models.applicant import Applicant  # noqa: E402
from app.models.job import Job, JobAssessmentQuestion, JobFormField  # noqa: E402
from app.models.pipeline import PipelineStage  # noqa: E402
from app.models.user import User  # noqa: E402
from app.security import issue_session_token  # noqa: E402
from app.services import storage as storage_svc  # noqa: E402


# ─── Core fixtures ────────────────────────────────────────────────────────────

@pytest.fixture()
def engine():
    """Fresh in-memory SQLite database for each test."""
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    yield eng
    SQLModel.metadata.drop_all(eng)


@pytest.fixture()
def session(engine):
    """Direct DB session — use this to seed data before making HTTP requests."""
    with Session(engine) as s:
        yield s


@pytest.fixture()
def client(engine):
    """TestClient wired to the in-memory DB with GCS disabled."""
    old_bucket = storage_svc.settings.gcs_bucket
    storage_svc.settings.gcs_bucket = None  # force local-file fallback

    def _override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _override
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()
    storage_svc.settings.gcs_bucket = old_bucket


# ─── Auth fixtures ────────────────────────────────────────────────────────────

@pytest.fixture()
def admin_user(session) -> User:
    u = User(email="admin@example.com", name="Test Admin", role=Role.admin)
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


@pytest.fixture()
def reviewer_user(session) -> User:
    u = User(email="reviewer@example.com", name="Test Reviewer", role=Role.reviewer)
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def _token(user: User) -> str:
    return issue_session_token(
        user_id=user.id,
        email=user.email,
        role=user.role.value,
    )


@pytest.fixture()
def admin_headers(admin_user) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(admin_user)}"}


@pytest.fixture()
def reviewer_headers(reviewer_user) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(reviewer_user)}"}


# ─── Factory helpers ──────────────────────────────────────────────────────────

def make_job(
    session: Session,
    *,
    title: str = "Software Engineer",
    slug: str | None = None,
    status: JobStatus = JobStatus.active,
    stages: list[str] | None = None,
) -> tuple[Job, list[PipelineStage]]:
    """Create a Job with at least one pipeline stage. Returns (job, stages)."""
    job = Job(
        title=title,
        slug=slug or title.lower().replace(" ", "-"),
        status=status,
        description_md="We are hiring a talented engineer.",
    )
    session.add(job)
    session.flush()

    stage_names = stages or ["Applied", "Interview", "Rejected"]
    db_stages = []
    for i, name in enumerate(stage_names):
        s = PipelineStage(
            job_id=job.id,
            name=name,
            sort_order=i,
            is_terminal=(name == "Rejected"),
        )
        session.add(s)
        db_stages.append(s)

    session.commit()
    session.refresh(job)
    for s in db_stages:
        session.refresh(s)
    return job, db_stages


def make_applicant(
    session: Session,
    job: Job,
    stage: PipelineStage,
    *,
    email: str = "jane@example.com",
    first_name: str = "Jane",
    last_name: str = "Doe",
) -> Applicant:
    """Create an Applicant in the given stage."""
    a = Applicant(
        job_id=job.id,
        current_stage_id=stage.id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone="555-0100",
        resume_gcs_path="local:///tmp/test-resume.pdf",
    )
    session.add(a)
    session.commit()
    session.refresh(a)
    return a
