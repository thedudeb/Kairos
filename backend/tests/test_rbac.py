"""Role-based access control tests.

Verifies that:
  - Unauthenticated requests → 401
  - Reviewer role (staff) can access read endpoints → 200
  - Reviewer role cannot access admin-only mutations → 403
  - Admin role can perform all mutations → 2xx

Every significant permission boundary is tested here so a future refactor
that accidentally widens or narrows permissions will be caught immediately.
"""
from __future__ import annotations

import pytest

from tests.conftest import make_applicant, make_job


# ─── Unauthenticated ──────────────────────────────────────────────────────────

def test_unauthenticated_list_applicants(client, session):
    job, _ = make_job(session)
    assert client.get(f"/jobs/{job.id}/applicants").status_code == 401


def test_unauthenticated_list_jobs(client, session):
    assert client.get("/jobs/").status_code == 401


def test_unauthenticated_create_job(client):
    assert client.post("/jobs/", json={"title": "X", "description_md": "Y"}).status_code == 401


def test_unauthenticated_create_stage(client, session):
    job, _ = make_job(session)
    assert client.post(
        f"/jobs/{job.id}/pipeline/stages",
        json={"name": "Screen"},
    ).status_code == 401


def test_unauthenticated_analytics(client, session):
    job, _ = make_job(session)
    assert client.get(f"/jobs/{job.id}/analytics").status_code == 401


def test_unauthenticated_export(client, session):
    job, _ = make_job(session)
    assert client.get(f"/jobs/{job.id}/export/applicants.csv").status_code == 401


# ─── Reviewer: read access allowed ───────────────────────────────────────────

def test_reviewer_can_list_jobs(client, session, reviewer_headers):
    resp = client.get("/jobs/", headers=reviewer_headers)
    assert resp.status_code == 200


def test_reviewer_can_list_applicants(client, session, reviewer_headers):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/applicants", headers=reviewer_headers)
    assert resp.status_code == 200


def test_reviewer_can_get_applicant_detail(client, session, reviewer_headers):
    job, stages = make_job(session)
    applicant = make_applicant(session, job, stages[0])
    resp = client.get(
        f"/jobs/{job.id}/applicants/{applicant.id}",
        headers=reviewer_headers,
    )
    assert resp.status_code == 200


def test_reviewer_can_list_pipeline_stages(client, session, reviewer_headers):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/pipeline/stages", headers=reviewer_headers)
    assert resp.status_code == 200


def test_reviewer_can_export_csv(client, session, reviewer_headers):
    """CSV export uses require_staff, so reviewers are allowed."""
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=reviewer_headers)
    assert resp.status_code == 200


def test_reviewer_can_view_analytics(client, session, reviewer_headers):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/analytics", headers=reviewer_headers)
    assert resp.status_code == 200


# ─── Reviewer: mutations blocked ─────────────────────────────────────────────

def test_reviewer_cannot_create_job(client, session, reviewer_headers):
    resp = client.post(
        "/jobs/",
        json={"title": "New Role", "description_md": "desc"},
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


def test_reviewer_cannot_create_pipeline_stage(client, session, reviewer_headers):
    job, _ = make_job(session)
    resp = client.post(
        f"/jobs/{job.id}/pipeline/stages",
        json={"name": "New Stage"},
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


def test_reviewer_cannot_delete_pipeline_stage(client, session, reviewer_headers):
    job, stages = make_job(session, stages=["Applied", "Rejected"])
    resp = client.delete(
        f"/jobs/{job.id}/pipeline/stages/{stages[0].id}",
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


def test_reviewer_cannot_move_applicant_stage(client, session, reviewer_headers):
    job, stages = make_job(session, stages=["Applied", "Interview"])
    applicant = make_applicant(session, job, stages[0])
    resp = client.patch(
        f"/jobs/{job.id}/applicants/{applicant.id}/stage",
        json={"stage_id": str(stages[1].id)},
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


def test_reviewer_cannot_add_note(client, session, reviewer_headers):
    job, stages = make_job(session)
    applicant = make_applicant(session, job, stages[0])
    resp = client.post(
        f"/jobs/{job.id}/applicants/{applicant.id}/notes",
        json={"body": "Interesting candidate."},
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


def test_reviewer_cannot_update_job_status(client, session, reviewer_headers):
    job, _ = make_job(session)
    resp = client.patch(
        f"/jobs/{job.id}/status",
        json={"status": "closed"},
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


def test_reviewer_cannot_reorder_stages(client, session, reviewer_headers):
    job, stages = make_job(session, stages=["Applied", "Rejected"])
    resp = client.put(
        f"/jobs/{job.id}/pipeline/stages",
        json=[
            {"id": str(stages[0].id), "sort_order": 1},
            {"id": str(stages[1].id), "sort_order": 0},
        ],
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


# ─── Admin: full access ───────────────────────────────────────────────────────

def test_admin_can_create_job(client, session, admin_headers):
    resp = client.post(
        "/jobs/",
        json={"title": "Admin Created Role", "description_md": "desc"},
        headers=admin_headers,
    )
    assert resp.status_code == 201


def test_admin_can_create_pipeline_stage(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.post(
        f"/jobs/{job.id}/pipeline/stages",
        json={"name": "Technical Round"},
        headers=admin_headers,
    )
    assert resp.status_code == 201


def test_admin_can_move_applicant_stage(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Interview"])
    applicant = make_applicant(session, job, stages[0])
    resp = client.patch(
        f"/jobs/{job.id}/applicants/{applicant.id}/stage",
        json={"stage_id": str(stages[1].id)},
        headers=admin_headers,
    )
    assert resp.status_code == 200


def test_admin_can_add_note(client, session, admin_headers):
    job, stages = make_job(session)
    applicant = make_applicant(session, job, stages[0])
    resp = client.post(
        f"/jobs/{job.id}/applicants/{applicant.id}/notes",
        json={"body": "Admin note."},
        headers=admin_headers,
    )
    assert resp.status_code == 201
