"""Tests for the public-facing application endpoint.

Covers: GET /public/jobs/{slug}, GET /public/jobs-active, and the full
POST /public/jobs/{slug}/apply flow including happy path, job-state guards,
duplicate-email check, resume validation, and custom field handling.

Rate-limit note: each test that POSTs to /apply passes a unique fake IP via
X-Forwarded-For so tests never share the same 5/hour counter window.
"""
from __future__ import annotations

import io

import pytest
from sqlmodel import select

from app.models._base import JobStatus
from app.models.applicant import Applicant
from app.models.job import JobFormField
from tests.conftest import make_applicant, make_job

# Minimal valid PDF bytes (magic header only — passes the content check)
_VALID_PDF = b"%PDF-1.4 minimal test"

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _apply(client, slug: str, *, ip: str, extra_data: dict | None = None, resume_bytes: bytes = _VALID_PDF,
           content_type: str = "application/pdf"):
    """POST to the apply endpoint with a default valid payload."""
    data = {
        "first_name": "Alice",
        "last_name": "Smith",
        "email": "alice@example.com",
        "phone": "555-1234",
    }
    if extra_data:
        data.update(extra_data)

    files = {"resume": ("resume.pdf", io.BytesIO(resume_bytes), content_type)}
    return client.post(
        f"/public/jobs/{slug}/apply",
        data=data,
        files=files,
        headers={"X-Forwarded-For": ip},
    )


# ─── GET /public/jobs/{slug} ──────────────────────────────────────────────────

def test_get_public_job_active_returns_200(client, session):
    job, _ = make_job(session, title="Frontend Dev", slug="frontend-dev", status=JobStatus.active)
    resp = client.get("/public/jobs/frontend-dev")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == "frontend-dev"
    assert data["title"] == "Frontend Dev"


def test_get_public_job_includes_form_fields(client, session):
    job, _ = make_job(session, slug="eng-with-fields")
    ff = JobFormField(
        job_id=job.id,
        label="Portfolio URL",
        field_type="url",
        is_required=False,
        sort_order=0,
    )
    session.add(ff)
    session.commit()

    resp = client.get("/public/jobs/eng-with-fields")
    assert resp.status_code == 200
    labels = [f["label"] for f in resp.json()["form_fields"]]
    assert "Portfolio URL" in labels


def test_get_public_job_draft_returns_404(client, session):
    make_job(session, slug="secret-draft", status=JobStatus.draft)
    resp = client.get("/public/jobs/secret-draft")
    assert resp.status_code == 404


def test_get_public_job_closed_returns_404(client, session):
    make_job(session, slug="closed-role", status=JobStatus.closed)
    resp = client.get("/public/jobs/closed-role")
    assert resp.status_code == 404


def test_get_public_job_nonexistent_returns_404(client, session):
    resp = client.get("/public/jobs/does-not-exist")
    assert resp.status_code == 404


# ─── GET /public/jobs-active ──────────────────────────────────────────────────

def test_list_active_jobs_returns_only_active(client, session):
    make_job(session, title="Active Role", slug="active-role", status=JobStatus.active)
    make_job(session, title="Draft Role", slug="draft-role", status=JobStatus.draft)
    make_job(session, title="Closed Role", slug="closed-role-2", status=JobStatus.closed)

    resp = client.get("/public/jobs-active")
    assert resp.status_code == 200
    slugs = [j["slug"] for j in resp.json()]
    assert "active-role" in slugs
    assert "draft-role" not in slugs
    assert "closed-role-2" not in slugs


def test_list_active_jobs_empty(client, session):
    resp = client.get("/public/jobs-active")
    assert resp.status_code == 200
    assert resp.json() == []


# ─── POST /public/jobs/{slug}/apply — happy path ─────────────────────────────

def test_submit_application_returns_201(client, session):
    make_job(session, slug="happy-path-job", status=JobStatus.active)
    resp = _apply(client, "happy-path-job", ip="1.0.0.1")
    assert resp.status_code == 201


def test_submit_application_returns_applicant_id(client, session):
    make_job(session, slug="returns-id", status=JobStatus.active)
    resp = _apply(client, "returns-id", ip="1.0.0.2")
    data = resp.json()
    assert "id" in data
    assert data["id"]  # non-empty UUID string


def test_submit_application_creates_db_row(client, session):
    make_job(session, slug="db-row-check", status=JobStatus.active)
    _apply(client, "db-row-check", ip="1.0.0.3")

    applicants = session.exec(select(Applicant)).all()
    assert len(applicants) == 1
    assert applicants[0].email == "alice@example.com"
    assert applicants[0].first_name == "Alice"
    assert applicants[0].last_name == "Smith"


def test_submit_application_strips_email_whitespace(client, session):
    make_job(session, slug="email-strip", status=JobStatus.active)
    data = {
        "first_name": "Bob",
        "last_name": "Builder",
        "email": "  BOB@EXAMPLE.COM  ",
        "phone": "555-9999",
    }
    files = {"resume": ("r.pdf", io.BytesIO(_VALID_PDF), "application/pdf")}
    client.post(
        "/public/jobs/email-strip/apply",
        data=data,
        files=files,
        headers={"X-Forwarded-For": "1.0.0.4"},
    )

    applicants = session.exec(select(Applicant)).all()
    assert applicants[0].email == "bob@example.com"


# ─── POST /public/jobs/{slug}/apply — job-state guards ───────────────────────

def test_apply_to_closed_job_returns_410(client, session):
    make_job(session, slug="closed-apply", status=JobStatus.closed)
    resp = _apply(client, "closed-apply", ip="1.0.1.1")
    assert resp.status_code == 410


def test_apply_to_draft_job_returns_404(client, session):
    make_job(session, slug="draft-apply", status=JobStatus.draft)
    resp = _apply(client, "draft-apply", ip="1.0.1.2")
    assert resp.status_code == 404


def test_apply_to_nonexistent_job_returns_404(client, session):
    resp = _apply(client, "ghost-job", ip="1.0.1.3")
    assert resp.status_code == 404


# ─── POST /public/jobs/{slug}/apply — duplicate email ────────────────────────

def test_duplicate_email_returns_409(client, session):
    job, stages = make_job(session, slug="dup-email", status=JobStatus.active)
    # Seed an existing applicant with the same email
    make_applicant(session, job, stages[0], email="alice@example.com")

    resp = _apply(client, "dup-email", ip="1.0.2.1")
    assert resp.status_code == 409


def test_duplicate_email_is_case_insensitive(client, session):
    job, stages = make_job(session, slug="dup-email-case", status=JobStatus.active)
    make_applicant(session, job, stages[0], email="alice@example.com")

    data = {
        "first_name": "Alice",
        "last_name": "Smith",
        "email": "ALICE@EXAMPLE.COM",  # different case
        "phone": "555-1234",
    }
    files = {"resume": ("r.pdf", io.BytesIO(_VALID_PDF), "application/pdf")}
    resp = client.post(
        "/public/jobs/dup-email-case/apply",
        data=data,
        files=files,
        headers={"X-Forwarded-For": "1.0.2.2"},
    )
    assert resp.status_code == 409


def test_same_email_allowed_for_different_job(client, session):
    """alice@example.com can apply to two different jobs."""
    job1, stages1 = make_job(session, slug="job-one", status=JobStatus.active)
    make_job(session, slug="job-two", status=JobStatus.active)
    make_applicant(session, job1, stages1[0], email="alice@example.com")

    # Apply to the SECOND job with the same email — should succeed
    resp = _apply(client, "job-two", ip="1.0.2.3")
    assert resp.status_code == 201


# ─── POST /public/jobs/{slug}/apply — resume validation ──────────────────────

def test_non_pdf_content_type_returns_422(client, session):
    make_job(session, slug="non-pdf", status=JobStatus.active)
    files = {"resume": ("r.doc", io.BytesIO(_VALID_PDF), "application/msword")}
    resp = client.post(
        "/public/jobs/non-pdf/apply",
        data={"first_name": "Alice", "last_name": "Smith", "email": "alice@example.com", "phone": "555"},
        files=files,
        headers={"X-Forwarded-For": "1.0.3.1"},
    )
    assert resp.status_code == 422


def test_invalid_pdf_magic_bytes_returns_422(client, session):
    make_job(session, slug="bad-magic", status=JobStatus.active)
    # Valid content-type but content starts with garbage bytes
    bad_bytes = b"\x00\x01\x02\x03 not a pdf"
    resp = _apply(client, "bad-magic", ip="1.0.3.2", resume_bytes=bad_bytes)
    assert resp.status_code == 422


def test_resume_too_large_returns_422(client, session):
    make_job(session, slug="big-resume", status=JobStatus.active)
    # Just over 10 MB
    oversized = b"%PDF-" + b"x" * (10 * 1024 * 1024 + 1)
    resp = _apply(client, "big-resume", ip="1.0.3.3", resume_bytes=oversized)
    assert resp.status_code == 422


# ─── POST /public/jobs/{slug}/apply — custom fields ──────────────────────────

def test_optional_custom_field_can_be_omitted(client, session):
    job, _ = make_job(session, slug="opt-field", status=JobStatus.active)
    ff = JobFormField(
        job_id=job.id,
        label="LinkedIn",
        field_type="url",
        is_required=False,
        sort_order=0,
    )
    session.add(ff)
    session.commit()

    # Don't include the custom field — should still succeed
    resp = _apply(client, "opt-field", ip="1.0.4.1")
    assert resp.status_code == 201


def test_required_custom_field_missing_returns_422(client, session):
    job, _ = make_job(session, slug="req-field", status=JobStatus.active)
    ff = JobFormField(
        job_id=job.id,
        label="Cover Letter",
        field_type="textarea",
        is_required=True,
        sort_order=0,
    )
    session.add(ff)
    session.commit()

    # Don't include the required field
    resp = _apply(client, "req-field", ip="1.0.4.2")
    assert resp.status_code == 422


def test_required_custom_field_provided_returns_201(client, session):
    job, _ = make_job(session, slug="req-field-ok", status=JobStatus.active)
    ff = JobFormField(
        job_id=job.id,
        label="Cover Letter",
        field_type="textarea",
        is_required=True,
        sort_order=0,
    )
    session.add(ff)
    session.commit()

    resp = _apply(
        client,
        "req-field-ok",
        ip="1.0.4.3",
        extra_data={f"custom_{ff.id}": "I am very excited about this role!"},
    )
    assert resp.status_code == 201


def test_invalid_dropdown_option_returns_422(client, session):
    job, _ = make_job(session, slug="dropdown-job", status=JobStatus.active)
    ff = JobFormField(
        job_id=job.id,
        label="Seniority",
        field_type="dropdown",
        is_required=True,
        options=["Junior", "Senior", "Staff"],
        sort_order=0,
    )
    session.add(ff)
    session.commit()

    resp = _apply(
        client,
        "dropdown-job",
        ip="1.0.4.4",
        extra_data={f"custom_{ff.id}": "Principal"},  # not in options
    )
    assert resp.status_code == 422


def test_valid_dropdown_option_accepted(client, session):
    job, _ = make_job(session, slug="dropdown-ok", status=JobStatus.active)
    ff = JobFormField(
        job_id=job.id,
        label="Seniority",
        field_type="dropdown",
        is_required=True,
        options=["Junior", "Senior", "Staff"],
        sort_order=0,
    )
    session.add(ff)
    session.commit()

    resp = _apply(
        client,
        "dropdown-ok",
        ip="1.0.4.5",
        extra_data={f"custom_{ff.id}": "Senior"},
    )
    assert resp.status_code == 201
