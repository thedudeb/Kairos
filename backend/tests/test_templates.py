"""Tests for template CRUD: create, read, update, delete, duplicate, validation."""
from __future__ import annotations

from uuid import UUID

import pytest
from sqlmodel import select

from app.models.template import Template, TemplateAssessmentQuestion, TemplateFormField
from app.models._base import FieldType


# ─── Payload helpers ──────────────────────────────────────────────────────────

def _minimal_payload(**overrides):
    """Minimum valid template body (one question required by validator)."""
    base = {
        "name": "Engineering Screen",
        "description": "Used for all engineering roles.",
        "form_fields": [
            {"label": "Portfolio URL", "field_type": "url", "is_required": False}
        ],
        "assessment_questions": [
            {"question_text": "Describe a complex system you built.", "max_attempts": 1}
        ],
    }
    base.update(overrides)
    return base


# ─── Create ───────────────────────────────────────────────────────────────────

def test_create_template_returns_201(client, session, admin_headers):
    resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    assert resp.status_code == 201


def test_create_template_returns_correct_fields(client, session, admin_headers):
    resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    data = resp.json()
    assert data["name"] == "Engineering Screen"
    assert data["description"] == "Used for all engineering roles."
    assert len(data["form_fields"]) == 1
    assert data["form_fields"][0]["label"] == "Portfolio URL"
    assert len(data["assessment_questions"]) == 1
    assert "complex system" in data["assessment_questions"][0]["question_text"]


def test_create_template_zero_questions_rejected(client, session, admin_headers):
    payload = _minimal_payload(assessment_questions=[])
    resp = client.post("/templates/", json=payload, headers=admin_headers)
    assert resp.status_code == 422


def test_create_template_requires_admin(client, session, reviewer_headers):
    resp = client.post("/templates/", json=_minimal_payload(), headers=reviewer_headers)
    assert resp.status_code == 403


def test_create_template_no_auth(client, session):
    resp = client.post("/templates/", json=_minimal_payload())
    assert resp.status_code == 401


# ─── List ─────────────────────────────────────────────────────────────────────

def test_list_templates_returns_created(client, session, admin_headers):
    client.post("/templates/", json=_minimal_payload(name="Alpha"), headers=admin_headers)
    client.post("/templates/", json=_minimal_payload(name="Beta"), headers=admin_headers)
    resp = client.get("/templates/", headers=admin_headers)
    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()]
    assert "Alpha" in names
    assert "Beta" in names


def test_list_templates_empty(client, session, admin_headers):
    resp = client.get("/templates/", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_templates_accessible_to_reviewer(client, session, reviewer_headers):
    resp = client.get("/templates/", headers=reviewer_headers)
    assert resp.status_code == 200


# ─── Get ──────────────────────────────────────────────────────────────────────

def test_get_template_by_id(client, session, admin_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]

    resp = client.get(f"/templates/{tid}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == tid


def test_get_nonexistent_template_returns_404(client, session, admin_headers):
    resp = client.get(
        "/templates/00000000-0000-0000-0000-000000000000",
        headers=admin_headers,
    )
    assert resp.status_code == 404


def test_get_template_accessible_to_reviewer(client, session, admin_headers, reviewer_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]
    resp = client.get(f"/templates/{tid}", headers=reviewer_headers)
    assert resp.status_code == 200


# ─── Update ───────────────────────────────────────────────────────────────────

def test_update_template_name(client, session, admin_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]

    resp = client.put(f"/templates/{tid}", json={"name": "Renamed Template"}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed Template"


def test_update_template_replaces_form_fields(client, session, admin_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]

    resp = client.put(
        f"/templates/{tid}",
        json={
            "form_fields": [
                {"label": "LinkedIn", "field_type": "url", "is_required": True},
                {"label": "Cover Letter", "field_type": "textarea", "is_required": False},
            ]
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    labels = [f["label"] for f in resp.json()["form_fields"]]
    assert labels == ["LinkedIn", "Cover Letter"]


def test_update_template_preserves_questions_when_omitted(client, session, admin_headers):
    """Sending only form_fields in an update must not wipe assessment questions."""
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]
    original_question = create_resp.json()["assessment_questions"][0]["question_text"]

    resp = client.put(
        f"/templates/{tid}",
        json={"form_fields": [{"label": "GitHub", "field_type": "url", "is_required": False}]},
        headers=admin_headers,
    )
    questions = resp.json()["assessment_questions"]
    assert len(questions) == 1
    assert questions[0]["question_text"] == original_question


def test_update_template_zero_questions_rejected(client, session, admin_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]

    resp = client.put(
        f"/templates/{tid}",
        json={"assessment_questions": []},
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_update_template_requires_admin(client, session, admin_headers, reviewer_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]

    resp = client.put(
        f"/templates/{tid}",
        json={"name": "Sneaky"},
        headers=reviewer_headers,
    )
    assert resp.status_code == 403


# ─── Delete ───────────────────────────────────────────────────────────────────

def test_delete_template_returns_204(client, session, admin_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]

    resp = client.delete(f"/templates/{tid}", headers=admin_headers)
    assert resp.status_code == 204


def test_delete_template_removes_child_rows(client, session, admin_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]
    client.delete(f"/templates/{tid}", headers=admin_headers)

    # Child rows should be gone (convert string ID from JSON to UUID)
    tid_uuid = UUID(tid)
    fields = session.exec(
        select(TemplateFormField).where(TemplateFormField.template_id == tid_uuid)
    ).all()
    questions = session.exec(
        select(TemplateAssessmentQuestion).where(
            TemplateAssessmentQuestion.template_id == tid_uuid
        )
    ).all()
    assert fields == []
    assert questions == []


def test_delete_template_404_afterwards(client, session, admin_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]
    client.delete(f"/templates/{tid}", headers=admin_headers)

    resp = client.get(f"/templates/{tid}", headers=admin_headers)
    assert resp.status_code == 404


def test_delete_template_requires_admin(client, session, admin_headers, reviewer_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]

    resp = client.delete(f"/templates/{tid}", headers=reviewer_headers)
    assert resp.status_code == 403


# ─── Duplicate ────────────────────────────────────────────────────────────────

def test_duplicate_template_returns_201(client, session, admin_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]

    resp = client.post(f"/templates/{tid}/duplicate", headers=admin_headers)
    assert resp.status_code == 201


def test_duplicate_template_name_has_copy_suffix(client, session, admin_headers):
    create_resp = client.post(
        "/templates/", json=_minimal_payload(name="Original"), headers=admin_headers
    )
    tid = create_resp.json()["id"]

    resp = client.post(f"/templates/{tid}/duplicate", headers=admin_headers)
    assert resp.json()["name"] == "Original (copy)"


def test_duplicate_template_copies_fields_and_questions(client, session, admin_headers):
    create_resp = client.post("/templates/", json=_minimal_payload(), headers=admin_headers)
    tid = create_resp.json()["id"]
    original = create_resp.json()

    copy_resp = client.post(f"/templates/{tid}/duplicate", headers=admin_headers)
    copy = copy_resp.json()

    # Different IDs
    assert copy["id"] != original["id"]

    # Same content
    assert len(copy["form_fields"]) == len(original["form_fields"])
    assert len(copy["assessment_questions"]) == len(original["assessment_questions"])
    assert copy["form_fields"][0]["label"] == original["form_fields"][0]["label"]
    assert (
        copy["assessment_questions"][0]["question_text"]
        == original["assessment_questions"][0]["question_text"]
    )


def test_duplicate_template_is_independent(client, session, admin_headers):
    """Editing the original after duplication must not affect the copy."""
    create_resp = client.post(
        "/templates/", json=_minimal_payload(name="Source"), headers=admin_headers
    )
    tid = create_resp.json()["id"]
    copy_id = client.post(f"/templates/{tid}/duplicate", headers=admin_headers).json()["id"]

    # Rename the original
    client.put(f"/templates/{tid}", json={"name": "Mutated"}, headers=admin_headers)

    # Copy should still have the old-derived name
    copy_resp = client.get(f"/templates/{copy_id}", headers=admin_headers)
    assert copy_resp.json()["name"] == "Source (copy)"
