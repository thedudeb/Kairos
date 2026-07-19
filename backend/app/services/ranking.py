"""Deterministic, local applicant fit scoring.

The scorer performs no network I/O and uses no model. Scores are transparent
heuristics intended for sorting assistance, not automated hiring decisions.
"""
from __future__ import annotations

import re
from typing import Any

_STOP_WORDS = {
    "and", "the", "for", "with", "that", "this", "from", "you", "your",
    "our", "are", "will", "have", "has", "job", "role", "team", "work",
}


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9+#.]{3,}", value.casefold())
        if token not in _STOP_WORDS
    }


def _clamp(value: float) -> int:
    return max(0, min(100, round(value)))


def score_applicant(
    *,
    job_title: str,
    job_description: str,
    parsed_resume: dict[str, Any],
    custom_field_values: list[dict] | None = None,
) -> dict[str, Any] | None:
    """Return explainable local scores, or ``None`` when inputs are missing."""
    if not job_title or not job_description or not parsed_resume:
        return None

    job_tokens = _tokens(f"{job_title} {job_description}")
    skill_names = [str(skill) for skill in (parsed_resume.get("skills") or [])]
    works = parsed_resume.get("work") or []
    education = parsed_resume.get("education") or []
    custom_text = " ".join(
        str(item.get("value") or "") for item in (custom_field_values or [])
    )
    candidate_text = " ".join(
        skill_names
        + [
            " ".join(
                str(work.get(key) or "")
                for key in ("title", "company", "description")
            )
            for work in works
        ]
        + [custom_text]
    )
    candidate_tokens = _tokens(candidate_text)
    overlap = job_tokens & candidate_tokens

    skills_match = _clamp(25 + 75 * len(overlap) / max(1, min(len(job_tokens), 12)))
    experience_match = _clamp(30 + min(len(works), 6) * 9 + min(len(overlap), 5) * 5)
    trajectory = _clamp(40 + min(len(works), 5) * 8 + min(len(education), 2) * 10)
    fit_score = _clamp(skills_match * 0.5 + experience_match * 0.3 + trajectory * 0.2)

    matched = ", ".join(sorted(overlap)[:5])
    reasoning = (
        f"Local rule-based score. Matched job terms: {matched}. "
        f"Resume includes {len(works)} work entries and {len(skill_names)} identified skills."
        if matched
        else f"Local rule-based score found limited keyword overlap; resume includes "
             f"{len(works)} work entries and {len(skill_names)} identified skills."
    )
    return {
        "fit_score": fit_score,
        "skills_match": skills_match,
        "experience_match": experience_match,
        "trajectory": trajectory,
        "reasoning": reasoning[:1000],
        "model": "local-rules-v1",
    }
