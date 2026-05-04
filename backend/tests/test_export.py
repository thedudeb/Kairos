"""Tests for the CSV export endpoint.

Verifies correct headers, applicant data inclusion, formula-injection
sanitisation, and that the endpoint is accessible to both admins and reviewers.
"""
from __future__ import annotations

import csv
import io

import pytest

from tests.conftest import make_applicant, make_job


def _parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


# ─── Structure ────────────────────────────────────────────────────────────────

def test_csv_export_returns_200(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=admin_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_csv_export_content_disposition(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=admin_headers)
    cd = resp.headers.get("content-disposition", "")
    assert "attachment" in cd
    assert ".csv" in cd


def test_csv_headers_match_expected_columns(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=admin_headers)
    rows = _parse_csv(resp.text)
    assert len(rows) >= 1
    header = rows[0]
    expected = [
        "First Name", "Last Name", "Email", "Phone",
        "Stage", "Parse Status", "Submitted At",
        "Institution", "Degree", "Parsed Name", "Parsed Email",
    ]
    assert header == expected


def test_csv_empty_job_has_only_header(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=admin_headers)
    rows = _parse_csv(resp.text)
    assert len(rows) == 1  # header only


# ─── Data correctness ─────────────────────────────────────────────────────────

def test_csv_contains_applicant_data(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied"])
    make_applicant(
        session, job, stages[0],
        first_name="Alice",
        last_name="Wonderland",
        email="alice@example.com",
    )

    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=admin_headers)
    rows = _parse_csv(resp.text)
    assert len(rows) == 2  # header + one data row
    data_row = rows[1]
    assert data_row[0] == "Alice"
    assert data_row[1] == "Wonderland"
    assert data_row[2] == "alice@example.com"
    assert data_row[4] == "Applied"  # Stage column


def test_csv_stage_name_is_populated(client, session, admin_headers):
    job, stages = make_job(session, stages=["Final Round"])
    make_applicant(session, job, stages[0])

    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=admin_headers)
    rows = _parse_csv(resp.text)
    assert rows[1][4] == "Final Round"


def test_csv_multiple_applicants(client, session, admin_headers):
    job, stages = make_job(session)
    for i in range(3):
        make_applicant(session, job, stages[0], email=f"person{i}@example.com")

    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=admin_headers)
    rows = _parse_csv(resp.text)
    assert len(rows) == 4  # header + 3 applicants


# ─── Formula injection sanitisation ──────────────────────────────────────────

def test_csv_sanitises_formula_injection_in_name(client, session, admin_headers):
    """A first name starting with '=' must be prefixed with a single quote."""
    job, stages = make_job(session)
    make_applicant(
        session, job, stages[0],
        first_name="=CMD|'/c calc'!A0",
        last_name="Legit",
        email="injector@example.com",
    )

    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=admin_headers)
    rows = _parse_csv(resp.text)
    # The CSV writer wraps quoted fields; check the raw text doesn't start a formula
    first_name_cell = rows[1][0]
    assert not first_name_cell.startswith("=")


# ─── Access control ───────────────────────────────────────────────────────────

def test_csv_export_accessible_to_reviewer(client, session, reviewer_headers):
    """Reviewers (staff) can export — export uses require_staff, not require_admin."""
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/export/applicants.csv", headers=reviewer_headers)
    assert resp.status_code == 200


def test_csv_export_requires_auth(client, session):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/export/applicants.csv")
    assert resp.status_code == 401
