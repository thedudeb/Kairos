"""Tests for applicant list, filtering, sorting, stage moves, and notes."""
from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.models._base import ParseStatus
from app.models.applicant import ApplicantNote
from app.models.pipeline import PipelineStage, StageTransition
from tests.conftest import make_applicant, make_job


# ─── List applicants ──────────────────────────────────────────────────────────

def test_list_applicants_returns_seeded_applicant(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0])

    resp = client.get(f"/jobs/{job.id}/applicants", headers=admin_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["email"] == "jane@example.com"


def test_list_applicants_empty_job(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/applicants", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_applicants_multiple(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0], email="a@example.com")
    make_applicant(session, job, stages[0], email="b@example.com")
    make_applicant(session, job, stages[0], email="c@example.com")

    resp = client.get(f"/jobs/{job.id}/applicants", headers=admin_headers)
    assert len(resp.json()) == 3


# ─── Filtering ────────────────────────────────────────────────────────────────

def test_filter_by_stage_id(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Interview", "Rejected"])
    make_applicant(session, job, stages[0], email="in-applied@example.com")
    make_applicant(session, job, stages[1], email="in-interview@example.com")

    resp = client.get(
        f"/jobs/{job.id}/applicants?stage_id={stages[1].id}",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["email"] == "in-interview@example.com"


def test_search_by_first_name(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0], first_name="Alice", last_name="Smith", email="alice@example.com")
    make_applicant(session, job, stages[0], first_name="Bob", last_name="Jones", email="bob@example.com")

    resp = client.get(
        f"/jobs/{job.id}/applicants?search=alice",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["email"] == "alice@example.com"


def test_search_by_email(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0], email="unique-needle@example.com")
    make_applicant(session, job, stages[0], email="other@example.com")

    resp = client.get(
        f"/jobs/{job.id}/applicants?search=unique-needle",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ─── Pagination ───────────────────────────────────────────────────────────────

def test_pagination_limit(client, session, admin_headers):
    job, stages = make_job(session)
    for i in range(5):
        make_applicant(session, job, stages[0], email=f"applicant{i}@example.com")

    resp = client.get(
        f"/jobs/{job.id}/applicants?limit=2&offset=0",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_pagination_offset(client, session, admin_headers):
    job, stages = make_job(session)
    for i in range(4):
        make_applicant(session, job, stages[0], email=f"p{i}@example.com")

    first_page = client.get(
        f"/jobs/{job.id}/applicants?limit=2&offset=0",
        headers=admin_headers,
    ).json()
    second_page = client.get(
        f"/jobs/{job.id}/applicants?limit=2&offset=2",
        headers=admin_headers,
    ).json()

    first_emails = {a["email"] for a in first_page}
    second_emails = {a["email"] for a in second_page}
    # Pages should not overlap
    assert first_emails.isdisjoint(second_emails)
    # Together they cover all four
    assert len(first_emails | second_emails) == 4


def test_pagination_beyond_end_returns_empty(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0])

    resp = client.get(
        f"/jobs/{job.id}/applicants?limit=10&offset=100",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ─── Sorting ──────────────────────────────────────────────────────────────────

def test_sort_by_last_name_asc(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0], last_name="Zimmermann", email="z@example.com")
    make_applicant(session, job, stages[0], last_name="Andersen", email="a@example.com")
    make_applicant(session, job, stages[0], last_name="Meyer", email="m@example.com")

    resp = client.get(
        f"/jobs/{job.id}/applicants?sort_by=last_name&sort_dir=asc",
        headers=admin_headers,
    )
    names = [a["last_name"] for a in resp.json()]
    assert names == sorted(names)


def test_sort_by_last_name_desc(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0], last_name="Zimmermann", email="z@example.com")
    make_applicant(session, job, stages[0], last_name="Andersen", email="a@example.com")

    resp = client.get(
        f"/jobs/{job.id}/applicants?sort_by=last_name&sort_dir=desc",
        headers=admin_headers,
    )
    names = [a["last_name"] for a in resp.json()]
    assert names == sorted(names, reverse=True)


# ─── Applicant detail ─────────────────────────────────────────────────────────

def test_get_applicant_detail(client, session, admin_headers):
    job, stages = make_job(session)
    applicant = make_applicant(session, job, stages[0])

    resp = client.get(
        f"/jobs/{job.id}/applicants/{applicant.id}",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(applicant.id)
    assert data["email"] == "jane@example.com"
    assert data["current_stage_name"] == stages[0].name
    assert "activity" in data
    assert "notes" in data
    # Activity timeline always contains the initial application_received event
    assert any(e["kind"] == "application_received" for e in data["activity"])


def test_get_applicant_detail_wrong_job_returns_404(client, session, admin_headers):
    job1, stages1 = make_job(session, slug="job-1")
    job2, _ = make_job(session, slug="job-2")
    applicant = make_applicant(session, job1, stages1[0])

    resp = client.get(
        f"/jobs/{job2.id}/applicants/{applicant.id}",
        headers=admin_headers,
    )
    assert resp.status_code == 404


# ─── Stage move ───────────────────────────────────────────────────────────────

def test_move_stage_updates_applicant(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Interview"])
    applicant = make_applicant(session, job, stages[0])

    resp = client.patch(
        f"/jobs/{job.id}/applicants/{applicant.id}/stage",
        json={"stage_id": str(stages[1].id)},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["current_stage_id"] == str(stages[1].id)


def test_move_stage_records_stage_transition(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Interview"])
    applicant = make_applicant(session, job, stages[0])

    client.patch(
        f"/jobs/{job.id}/applicants/{applicant.id}/stage",
        json={"stage_id": str(stages[1].id)},
        headers=admin_headers,
    )

    transitions = session.exec(
        select(StageTransition).where(StageTransition.applicant_id == applicant.id)
    ).all()
    assert len(transitions) == 1
    assert transitions[0].from_stage_id == stages[0].id
    assert transitions[0].to_stage_id == stages[1].id


def test_move_stage_transition_appears_in_activity(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Interview"])
    applicant = make_applicant(session, job, stages[0])

    client.patch(
        f"/jobs/{job.id}/applicants/{applicant.id}/stage",
        json={"stage_id": str(stages[1].id)},
        headers=admin_headers,
    )

    resp = client.get(
        f"/jobs/{job.id}/applicants/{applicant.id}",
        headers=admin_headers,
    )
    activity = resp.json()["activity"]
    stage_events = [e for e in activity if e["kind"] == "stage_transition"]
    assert len(stage_events) == 1
    assert "Interview" in stage_events[0]["detail"]


def test_move_stage_to_wrong_job_rejected(client, session, admin_headers):
    job1, stages1 = make_job(session, slug="job-a")
    job2, stages2 = make_job(session, slug="job-b")
    applicant = make_applicant(session, job1, stages1[0])

    resp = client.patch(
        f"/jobs/{job1.id}/applicants/{applicant.id}/stage",
        json={"stage_id": str(stages2[0].id)},
        headers=admin_headers,
    )
    assert resp.status_code == 400


# ─── Notes ────────────────────────────────────────────────────────────────────

def test_add_note_returns_201(client, session, admin_headers):
    job, stages = make_job(session)
    applicant = make_applicant(session, job, stages[0])

    resp = client.post(
        f"/jobs/{job.id}/applicants/{applicant.id}/notes",
        json={"body": "Strong candidate — good problem-solving skills."},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["body"] == "Strong candidate — good problem-solving skills."
    assert "author_name" in data
    assert "created_at" in data


def test_add_note_appears_in_detail(client, session, admin_headers):
    job, stages = make_job(session)
    applicant = make_applicant(session, job, stages[0])

    client.post(
        f"/jobs/{job.id}/applicants/{applicant.id}/notes",
        json={"body": "Follow up next week."},
        headers=admin_headers,
    )

    resp = client.get(
        f"/jobs/{job.id}/applicants/{applicant.id}",
        headers=admin_headers,
    )
    notes = resp.json()["notes"]
    assert len(notes) == 1
    assert notes[0]["body"] == "Follow up next week."


def test_add_note_appears_in_activity_timeline(client, session, admin_headers):
    job, stages = make_job(session)
    applicant = make_applicant(session, job, stages[0])

    client.post(
        f"/jobs/{job.id}/applicants/{applicant.id}/notes",
        json={"body": "Called references."},
        headers=admin_headers,
    )

    resp = client.get(
        f"/jobs/{job.id}/applicants/{applicant.id}",
        headers=admin_headers,
    )
    activity = resp.json()["activity"]
    note_events = [e for e in activity if e["kind"] == "note"]
    assert len(note_events) == 1
    assert "Called references" in note_events[0]["detail"]


def test_note_body_too_long_rejected(client, session, admin_headers):
    job, stages = make_job(session)
    applicant = make_applicant(session, job, stages[0])

    resp = client.post(
        f"/jobs/{job.id}/applicants/{applicant.id}/notes",
        json={"body": "x" * 10_001},
        headers=admin_headers,
    )
    assert resp.status_code == 422
