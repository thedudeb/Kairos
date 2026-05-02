"""ARQ worker entrypoint.

Runs as a separate Cloud Run service from the same `backend/` image:

    arq app.worker.main.WorkerSettings

Or locally (once Redis is available):

    uv run arq app.worker.main.WorkerSettings
"""
from __future__ import annotations

import structlog
from arq.connections import RedisSettings

from app.config import settings
from app.worker.tasks import parse_resume, rank_applicant

log = structlog.get_logger()


async def startup(ctx: dict) -> None:
    log.info("worker.startup")


async def shutdown(ctx: dict) -> None:
    log.info("worker.shutdown")


def _redis_settings() -> RedisSettings:
    rs = RedisSettings.from_dsn(settings.redis_url)
    # Upstash (and most managed Redis providers) require TLS but present a
    # certificate that may not pass strict verification inside Cloud Run.
    # ssl_cert_reqs=None disables cert verification while keeping encryption.
    if settings.redis_url.startswith("rediss://"):
        rs.ssl_cert_reqs = None
    return rs


class WorkerSettings:
    redis_settings = _redis_settings()
    functions = [parse_resume, rank_applicant]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = settings.arq_queue_name
    max_jobs = 4
    job_timeout = 120  # seconds per job
    keep_result = 3600  # keep result in Redis for 1 hour
