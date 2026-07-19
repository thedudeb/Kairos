"""Conservative deterministic resume extraction with no model or network use."""
from __future__ import annotations

import re
from typing import Any

_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
_PHONE_RE = re.compile(r"(?<!\w)(?:\+?\d[\d\s().-]{6,}\d)(?!\w)")
_DEGREE_WORDS = ("bachelor", "master", "phd", "doctorate", "bsc", "msc", "mba", "degree")
_INSTITUTION_WORDS = ("university", "college", "institute", "school")
_KNOWN_SKILLS = (
    "Python", "JavaScript", "TypeScript", "Java", "C#", "C++", "Go", "Rust",
    "React", "Next.js", "Node.js", "FastAPI", "Django", "Flask", "SQL",
    "PostgreSQL", "Redis", "Docker", "Kubernetes", "AWS", "Azure", "Git",
    "Figma", "Product Management", "Data Analysis", "Machine Learning",
)


def parse_resume_text(resume_text: str) -> dict[str, Any]:
    """Extract conservative resume fields locally with no model or network call."""
    lines = [line.strip() for line in resume_text.splitlines() if line.strip()]
    email_match = _EMAIL_RE.search(resume_text)
    phone_match = _PHONE_RE.search(resume_text)

    full_name: str | None = None
    for line in lines[:12]:
        words = line.split()
        if (
            2 <= len(words) <= 5
            and len(line) <= 100
            and "@" not in line
            and not any(char.isdigit() for char in line)
            and all(any(c.isalpha() for c in word) for word in words)
        ):
            full_name = line
            break

    institution = next(
        (line for line in lines if any(word in line.casefold() for word in _INSTITUTION_WORDS)),
        None,
    )
    degree = next(
        (line for line in lines if any(word in line.casefold() for word in _DEGREE_WORDS)),
        None,
    )
    haystack = resume_text.casefold()
    skills = [
        skill for skill in _KNOWN_SKILLS
        if re.search(rf"(?<!\w){re.escape(skill.casefold())}(?!\w)", haystack)
    ]
    education = []
    if institution or degree:
        education.append({
            "institution": institution,
            "degree": degree,
            "field_of_study": None,
            "start_year": None,
            "end_year": None,
        })

    notes = {"parser": "Deterministic local extraction; verify fields manually."}
    if not email_match:
        notes["email"] = "not found"
    if not full_name:
        notes["full_name"] = "not confidently identified"

    return {
        "full_name": full_name,
        "email": email_match.group(0) if email_match else None,
        "phone": phone_match.group(0).strip() if phone_match else None,
        "top_institution": institution,
        "top_degree": degree,
        "education": education,
        "work": [],
        "skills": skills,
        "confidence_notes": notes,
    }
