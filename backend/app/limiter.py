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
from starlette.requests import Request

from app.config import settings


def _get_client_ip(request: Request) -> str:
    """Return the real client IP, honouring X-Forwarded-For when present.

    We take the *last* entry in X-Forwarded-For, not the first. Cloud Load
    Balancing (and Cloud Run's upstream proxy) *appends* the true client IP,
    so the rightmost entry is the one the trusted infrastructure added and
    cannot be spoofed by the client. Taking [0] would let an attacker bypass
    rate limits by sending a forged X-Forwarded-For header.

    Falls back to the TCP peer address for direct connections (local dev, tests).
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        ip = forwarded_for.split(",")[-1].strip()
        if ip:
            return ip
    return get_remote_address(request) or "0.0.0.0"


limiter = Limiter(
    key_func=_get_client_ip,
    storage_uri=settings.redis_url,
    default_limits=[],
)
