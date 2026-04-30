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
from app.worker.tasks import parse_resume

log = structlog.get_logger()


async def startup(ctx: dict) -> None:
    log.info("worker.startup")


async def shutdown(ctx: dict) -> None:
    log.info("worker.shutdown")


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [parse_resume]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = "recruitment:default"
    max_jobs = 4
    job_timeout = 120  # seconds per job
    keep_result = 3600  # keep result in Redis for 1 hour
