"""Shared helpers for working with LLM (Gemini) responses."""
from __future__ import annotations

import json
import re
from typing import Any

# Matches optional opening ``` or ```json fence and matching closing ```
_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?|\n?```\s*$", re.MULTILINE)


def extract_json(raw: str) -> dict[str, Any]:
    """Strip any markdown code fences from *raw* and parse as JSON.

    Gemini is instructed to return plain JSON but occasionally wraps the
    response in ```json ... ``` fences. This helper handles both cases
    robustly so callers never need to duplicate the stripping logic.

    Raises ``json.JSONDecodeError`` on invalid JSON (caller should catch).
    """
    cleaned = _FENCE_RE.sub("", raw.strip()).strip()
    return json.loads(cleaned)
