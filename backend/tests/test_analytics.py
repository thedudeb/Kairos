"""Tests for the per-job analytics endpoint.

Verifies counts, stage distribution, and date-range filtering with seeded data.
"""
from __future__ import annotations

import pytest
from datetime import datetime, timedelta, timezone

from tests.conftest import make_applicant, make_job


def test_analytics_empty_job_returns_zeros(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/analytics", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_applicants"] == 0
    assert data["volume_by_day"] != []  # days are always filled (with zeroes)
    assert all(d["count"] == 0 for d in data["volume_by_day"])


def test_analytics_counts_total_applicants(client, session, admin_headers):
    job, stages = make_job(session)
    make_applicant(session, job, stages[0], email="a@example.com")
    make_applicant(session, job, stages[0], email="b@example.com")
    make_applicant(session, job, stages[0], email="c@example.com")

    resp = client.get(f"/jobs/{job.id}/analytics", headers=admin_headers)
    assert resp.json()["total_applicants"] == 3


def test_analytics_stage_distribution_sums_to_total(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Interview", "Rejected"])
    make_applicant(session, job, stages[0], email="a@example.com")
    make_applicant(session, job, stages[0], email="b@example.com")
    make_applicant(session, job, stages[1], email="c@example.com")

    resp = client.get(f"/jobs/{job.id}/analytics", headers=admin_headers)
    data = resp.json()
    dist = data["stage_distribution"]
    stage_total = sum(s["count"] for s in dist)
    assert stage_total == data["total_applicants"]


def test_analytics_stage_distribution_names_match(client, session, admin_headers):
    job, stages = make_job(session, stages=["Applied", "Technical", "Offer"])

    resp = client.get(f"/jobs/{job.id}/analytics", headers=admin_headers)
    dist_names = {s["name"] for s in resp.json()["stage_distribution"]}
    assert dist_names == {"Applied", "Technical", "Offer"}


def test_analytics_volume_by_day_length_matches_window(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(
        f"/jobs/{job.id}/analytics?volume_days=14",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["volume_days"] == 14
    assert len(data["volume_by_day"]) == 14


def test_analytics_volume_by_day_dates_are_sequential(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(
        f"/jobs/{job.id}/analytics?volume_days=7",
        headers=admin_headers,
    )
    days = [d["date"] for d in resp.json()["volume_by_day"]]
    # Each date should be one day after the previous
    for i in range(1, len(days)):
        prev = datetime.strptime(days[i - 1], "%Y-%m-%d")
        curr = datetime.strptime(days[i], "%Y-%m-%d")
        assert (curr - prev).days == 1


def test_analytics_custom_date_range(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(
        f"/jobs/{job.id}/analytics?volume_from=2024-01-01&volume_to=2024-01-10",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["volume_range_start"] == "2024-01-01"
    assert len(data["volume_by_day"]) == 10  # inclusive: 1–10 = 10 days


def test_analytics_custom_range_requires_both_bounds(client, session, admin_headers):
    job, _ = make_job(session)
    # Providing only volume_from without volume_to should fail
    resp = client.get(
        f"/jobs/{job.id}/analytics?volume_from=2024-01-01",
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_analytics_range_from_after_to_rejected(client, session, admin_headers):
    job, _ = make_job(session)
    resp = client.get(
        f"/jobs/{job.id}/analytics?volume_from=2024-06-10&volume_to=2024-01-01",
        headers=admin_headers,
    )
    assert resp.status_code == 422


def test_analytics_requires_auth(client, session):
    job, _ = make_job(session)
    resp = client.get(f"/jobs/{job.id}/analytics")
    assert resp.status_code == 401
