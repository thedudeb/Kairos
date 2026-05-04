"""Tests for pipeline stage management endpoints.

Covers: create, rename, reorder, delete (empty / with applicants / last stage),
and the move_to reassignment path.
"""
from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.models.applicant import Applicant
from app.models.pipeline import PipelineStage
from tests.conftest import make_applicant, make_job


# ─── Create ───────────────────────────────────────────────────────────────────

def test_create_stage_returns_201(client, session, admin_headers):
    job, _ = make_job(session, stages=["Applied"])
    resp = client.post(
        f"/jobs/{job.id}/pipeline/stages",
        json={"name": "Technical Screen", "is_terminal": False},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Technical Screen"
    assert data["job_id"] == str(job.id)
    assert data["is_terminal"] is False


def test_create_stage_appears_in_list(client, session, admin_headers):
    job, _ = make_job(session, stages=["Applied"])
    client.post(
        f"/jobs/{job.id}/pipeline/stages",
        json={"name": "Offer"},
        headers=admin_headers,
    )
    resp = client.get(f"/jobs/{job.id}/pipeline/stages", headers=admin_headers)
    names = [s["name"] for s in resp.json()]
    assert "Offer" in names


def test_create_stage_requires_auth(client, session):
    job, _ = make_job(session)
    resp = client.post(
        f"/jobs/{job.id}/pipeline/stages",
        json={"name": "Ghost Stage"},
    )
    assert resp.status_code == 401


# ─── Update ───────────────────────────────────────────────────────────────────

def test_update_stage_renames_it(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied"])
    stage = stages[0]
    resp = client.put(
        f"/jobs/{job.id}/pipeline/stages/{stage.id}",
        json={"name": "Screening"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Screening"


def test_update_stage_toggles_terminal(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied"])
    stage = stages[0]
    resp = client.put(
        f"/jobs/{job.id}/pipeline/stages/{stage.id}",
        json={"is_terminal": True},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_terminal"] is True


# ─── Reorder ──────────────────────────────────────────────────────────────────

def test_reorder_stages(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Interview", "Offer"])
    s0, s1, s2 = stages

    # Reverse the order
    resp = client.put(
        f"/jobs/{job.id}/pipeline/stages",
        json=[
            {"id": str(s0.id), "sort_order": 2},
            {"id": str(s1.id), "sort_order": 1},
            {"id": str(s2.id), "sort_order": 0},
        ],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    returned_names = [s["name"] for s in resp.json()]
    assert returned_names == ["Offer", "Interview", "Applied"]


# ─── Delete (empty stage) ─────────────────────────────────────────────────────

def test_delete_empty_stage_returns_204(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Rejected"])
    resp = client.delete(
        f"/jobs/{job.id}/pipeline/stages/{stages[0].id}",
        headers=admin_headers,
    )
    assert resp.status_code == 204


def test_delete_stage_removes_it_from_list(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Rejected"])
    client.delete(
        f"/jobs/{job.id}/pipeline/stages/{stages[0].id}",
        headers=admin_headers,
    )
    resp = client.get(f"/jobs/{job.id}/pipeline/stages", headers=admin_headers)
    remaining_names = [s["name"] for s in resp.json()]
    assert "Applied" not in remaining_names
    assert "Rejected" in remaining_names


# ─── Delete (last stage) ──────────────────────────────────────────────────────

def test_delete_last_stage_is_rejected(client, session, admin_headers):
    job, stages = make_job(session, stages=["Only Stage"])
    resp = client.delete(
        f"/jobs/{job.id}/pipeline/stages/{stages[0].id}",
        headers=admin_headers,
    )
    assert resp.status_code == 409
    assert "last" in resp.json()["detail"].lower()


# ─── Delete (stage with applicants) ──────────────────────────────────────────

def test_delete_populated_stage_without_move_to_rejected(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Rejected"])
    make_applicant(session, job, stages[0])

    resp = client.delete(
        f"/jobs/{job.id}/pipeline/stages/{stages[0].id}",
        headers=admin_headers,
    )
    assert resp.status_code == 409
    assert "applicant" in resp.json()["detail"].lower()


def test_delete_populated_stage_with_move_to_reassigns_applicants(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Rejected"])
    applicant = make_applicant(session, job, stages[0])

    resp = client.delete(
        f"/jobs/{job.id}/pipeline/stages/{stages[0].id}?move_to={stages[1].id}",
        headers=admin_headers,
    )
    assert resp.status_code == 204

    # Applicant should now be in "Rejected"
    session.expire(applicant)
    refreshed = session.get(Applicant, applicant.id)
    assert refreshed.current_stage_id == stages[1].id


def test_delete_stage_move_to_self_rejected(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Rejected"])
    make_applicant(session, job, stages[0])

    resp = client.delete(
        f"/jobs/{job.id}/pipeline/stages/{stages[0].id}?move_to={stages[0].id}",
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_delete_stage_move_to_wrong_job_rejected(client, session, admin_headers):
    job1, stages1 = make_job(session, stages=["Applied", "Rejected"], slug="job-1")
    job2, stages2 = make_job(session, stages=["Applied"], slug="job-2")
    make_applicant(session, job1, stages1[0])

    # Try to move applicants to a stage in a different job
    resp = client.delete(
        f"/jobs/{job1.id}/pipeline/stages/{stages1[0].id}?move_to={stages2[0].id}",
        headers=admin_headers,
    )
    assert resp.status_code == 404
