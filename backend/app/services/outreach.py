"""Deterministic local outreach templates with no AI or network calls."""
from __future__ import annotations

from typing import Any


def draft_outreach(
    *,
    job_title: str,
    stage_name: str,
    parsed_resume: dict[str, Any],
) -> dict[str, str]:
    full_name = str(parsed_resume.get("full_name") or "there").strip()
    first_name = full_name.split()[0] if full_name else "there"
    skills = [str(skill) for skill in (parsed_resume.get("skills") or []) if skill]
    detail = f" Your experience with {skills[0]} stood out to our team." if skills else ""
    return {
        "subject": f"Update on your application — {job_title}"[:200],
        "body": (
            f"Hi {first_name},\n\n"
            f"Thank you for your interest in the {job_title} position.{detail} "
            f"We'd like to move you forward to the {stage_name} stage.\n\n"
            "Please let me know if you have any questions.\n\nBest regards,"
        )[:2000],
    }
