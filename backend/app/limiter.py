"""Shared slowapi rate-limiter instance.

Imported by main.py (registered on app.state) and any router that needs
to apply rate limits. Using a single module avoids the circular-import
problem of importing from main.py, and ensures all decorators share the
same counter storage.

Redis storage is used so counters are consistent across multiple worker
processes / Cloud Run instances.
"""
from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=[],
)
