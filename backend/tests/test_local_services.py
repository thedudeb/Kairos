from __future__ import annotations

import pytest

from app.services.outreach import draft_outreach
from app.services.ranking import score_applicant
from app.services.storage import read_file_bytes
from app.services.resume_parser import parse_resume_text


def test_resume_parser_runs_locally_and_extracts_conservative_fields():
    parsed = parse_resume_text(
        """Jane Example
jane@example.com | +1 555 123 4567
Python, TypeScript, PostgreSQL
MSc Computer Science, Example University
"""
    )
    assert parsed["full_name"] == "Jane Example"
    assert parsed["email"] == "jane@example.com"
    assert "Python" in parsed["skills"]
    assert parsed["top_institution"] is not None
    assert parsed["confidence_notes"]["parser"].startswith("Deterministic")


def test_fit_score_is_deterministic_and_identifies_local_model():
    kwargs = {
        "job_title": "Python Backend Engineer",
        "job_description": "Build Python APIs with FastAPI and PostgreSQL",
        "parsed_resume": {
            "skills": ["Python", "FastAPI", "PostgreSQL"],
            "work": [{"title": "Backend Engineer", "company": "Example", "description": "Python APIs"}],
            "education": [],
        },
    }
    first = score_applicant(**kwargs)
    second = score_applicant(**kwargs)
    assert first == second
    assert first is not None
    assert first["model"] == "local-rules-v1"
    assert first["fit_score"] > 50


def test_outreach_uses_local_template():
    result = draft_outreach(
        job_title="Backend Engineer",
        stage_name="Interview",
        parsed_resume={"full_name": "Jane Example", "skills": ["Python"]},
    )
    assert result["subject"] == "Update on your application — Backend Engineer"
    assert "Hi Jane" in result["body"]
    assert "Python" in result["body"]


def test_legacy_cloud_path_never_falls_back_to_cloud():
    with pytest.raises(FileNotFoundError, match="cloud storage is disabled"):
        read_file_bytes("gs://old-bucket/resumes/example.pdf")
