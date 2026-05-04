"""Tests for job CRUD, status transitions, slug handling, and template snapshots."""
from __future__ import annotations

import pytest
from sqlmodel import select

from app.models._base import JobStatus
from app.models.job import Job, JobAssessmentQuestion, JobFormField
from app.models.pipeline import PipelineStage
from app.models.template import Template, TemplateAssessmentQuestion, TemplateFormField
from app.models._base import FieldType
from tests.conftest import make_applicant, make_job


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _one_question():
    return [{"question_text": "Describe a challenge.", "max_attempts": 1}]


def _create_job(client, headers, *, title="Backend Engineer", slug=None, **extra):
    body = {"title": title, "description_md": "We are hiring."}
    if slug:
        body["slug"] = slug
    body.update(extra)
    return client.post("/jobs/", json=body, headers=headers)


# ─── Create ───────────────────────────────────────────────────────────────────

def test_create_job_returns_201(client, session, admin_headers):
    resp = _create_job(client, admin_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Backend Engineer"
    assert data["status"] == "draft"  # default


def test_create_job_seeds_default_pipeline_stages(client, session, admin_headers):
    resp = _create_job(client, admin_headers)
    job_id = resp.json()["id"]
    stages_resp = client.get(f"/jobs/{job_id}/pipeline-stages", headers=admin_headers)
    assert stages_resp.status_code == 200
    names = [s["name"] for s in stages_resp.json()]
    # Default stages must include at least Applied and Rejected
    assert "Applied" in names
    assert "Rejected" in names


def test_create_job_auto_generates_slug(client, session, admin_headers):
    resp = _create_job(client, admin_headers, title="Senior Data Scientist")
    assert resp.json()["slug"] == "senior-data-scientist"


def test_create_job_respects_custom_slug(client, session, admin_headers):
    resp = _create_job(client, admin_headers, slug="my-custom-slug")
    assert resp.json()["slug"] == "my-custom-slug"


def test_create_job_duplicate_slug_rejected(client, session, admin_headers):
    _create_job(client, admin_headers, slug="unique-slug")
    resp = _create_job(client, admin_headers, slug="unique-slug")
    assert resp.status_code == 409


def test_create_job_requires_admin(client, session, reviewer_headers):
    resp = _create_job(client, reviewer_headers)
    assert resp.status_code == 403


# ─── List ─────────────────────────────────────────────────────────────────────

def test_list_jobs_returns_created_job(client, session, admin_headers):
    make_job(session, title="Existing Job", slug="existing-job")
    resp = client.get("/jobs/", headers=admin_headers)
    assert resp.status_code == 200
    titles = [j["title"] for j in resp.json()]
    assert "Existing Job" in titles


def test_list_jobs_includes_summary(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0])

    resp = client.get("/jobs/", headers=admin_headers)
    jobs = resp.json()
    matching = [j for j in jobs if j["id"] == str(job.id)]
    assert len(matching) == 1
    assert matching[0]["summary"]["total_applicants"] == 1


def test_list_jobs_empty(client, session, admin_headers):
    resp = client.get("/jobs/", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json() == []


# ─── Get ──────────────────────────────────────────────────────────────────────

def test_get_job_returns_correct_fields(client, session, admin_headers):
    job, _ = make_job(session, title="DevOps Lead", slug="devops-lead")
    resp = client.get(f"/jobs/{job.id}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "DevOps Lead"
    assert resp.json()["slug"] == "devops-lead"


def test_get_job_not_found(client, session, admin_headers):
    resp = client.get("/jobs/00000000-0000-0000-0000-000000000000", headers=admin_headers)
    assert resp.status_code == 404


# ─── Update ───────────────────────────────────────────────────────────────────

def test_update_job_title(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.put(
        f"/jobs/{job.id}",
        json={"title": "Renamed Role"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Renamed Role"


def test_update_job_slug(client, session, admin_headers):
    job, _ = make_job(session, slug="old-slug")
    resp = client.put(
        f"/jobs/{job.id}",
        json={"slug": "new-slug"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["slug"] == "new-slug"


def test_update_job_slug_collision_rejected(client, session, admin_headers):
    make_job(session, slug="taken-slug")
    job2, _ = make_job(session, slug="other-slug")

    resp = client.put(
        f"/jobs/{job2.id}",
        json={"slug": "taken-slug"},
        headers=admin_headers,
    )
    assert resp.status_code == 409


def test_update_job_requires_admin(client, session, reviewer_headers):
    job, _ = make_job(session)
    resp = client.put(
        f"/jobs/{job.id}",
        json={"title": "Sneaky Update"},
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


# ─── Status transitions ───────────────────────────────────────────────────────

def test_activate_draft_job(client, session, admin_headers):
    job, _ = make_job(session, status=JobStatus.draft)
    resp = client.patch(
        f"/jobs/{job.id}/status",
        json={"status": "active"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


def test_close_active_job(client, session, admin_headers):
    job, _ = make_job(session, status=JobStatus.active)
    resp = client.patch(
        f"/jobs/{job.id}/status",
        json={"status": "closed"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "closed"


def test_status_update_requires_admin(client, session, reviewer_headers):
    job, _ = make_job(session)
    resp = client.patch(
        f"/jobs/{job.id}/status",
        json={"status": "active"},
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


# ─── Delete ───────────────────────────────────────────────────────────────────

def test_delete_empty_job_returns_204(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.delete(f"/jobs/{job.id}", headers=admin_headers)
    assert resp.status_code == 204


def test_delete_job_removes_it_from_list(client, session, admin_headers):
    job, _ = make_job(session, slug="to-delete")
    client.delete(f"/jobs/{job.id}", headers=admin_headers)
    resp = client.get("/jobs/", headers=admin_headers)
    assert all(j["id"] != str(job.id) for j in resp.json())


def test_delete_job_with_applicants_rejected(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0])
    resp = client.delete(f"/jobs/{job.id}", headers=admin_headers)
    assert resp.status_code == 409


def test_delete_job_requires_admin(client, session, reviewer_headers):
    job, _ = make_job(session)
    resp = client.delete(f"/jobs/{job.id}", headers=reviewer_headers)
    assert resp.status_code == 403


# ─── Apply template ───────────────────────────────────────────────────────────

def _seed_template(session) -> Template:
    tmpl = Template(name="Standard Eng", description="For eng roles")
    session.add(tmpl)
    session.flush()
    session.add(TemplateFormField(
        template_id=tmpl.id,
        label="GitHub profile",
        field_type=FieldType.url,
        is_required=False,
        sort_order=0,
    ))
    session.add(TemplateAssessmentQuestion(
        template_id=tmpl.id,
        question_text="Walk us through your best project.",
        max_attempts=2,
        sort_order=0,
    ))
    session.commit()
    session.refresh(tmpl)
    return tmpl


def test_create_job_with_template_snapshots_fields(client, session, admin_headers):
    tmpl = _seed_template(session)
    resp = _create_job(client, admin_headers, template_id=str(tmpl.id))
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["form_fields"]) == 1
    assert data["form_fields"][0]["label"] == "GitHub profile"
    assert len(data["assessment_questions"]) == 1
    assert data["assessment_questions"][0]["question_text"] == "Walk us through your best project."


def test_apply_template_to_existing_job(client, session, admin_headers):
    job, _ = make_job(session)
    tmpl = _seed_template(session)
    resp = client.post(
        f"/jobs/{job.id}/apply-template",
        json={"template_id": str(tmpl.id)},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert any(f["label"] == "GitHub profile" for f in data["form_fields"])
    assert any(q["question_text"] == "Walk us through your best project." for q in data["assessment_questions"])


def test_template_snapshot_is_independent(client, session, admin_headers):
    """Editing the original template must not affect a job that already applied it."""
    tmpl = _seed_template(session)
    job, _ = make_job(session)
    client.post(
        f"/jobs/{job.id}/apply-template",
        json={"template_id": str(tmpl.id)},
        headers=admin_headers,
    )

    # Now update the template's question text
    client.put(
        f"/templates/{tmpl.id}",
        json={"assessment_questions": [{"question_text": "NEW QUESTION", "max_attempts": 1}]},
        headers=admin_headers,
    )

    # Job's snapshot must be unchanged
    job_resp = client.get(f"/jobs/{job.id}", headers=admin_headers)
    job_question = job_resp.json()["assessment_questions"][0]["question_text"]
    assert job_question == "Walk us through your best project."
