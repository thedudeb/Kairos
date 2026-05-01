"""FastAPI entrypoint."""
from __future__ import annotations

import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.limiter import limiter
from app.routers import analytics, applicants, export, health, integrations, internal_auth, jobs, me, pipeline, public, templates, users_admin

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Best-effort ARQ pool — submissions still work without Redis
    try:
        from arq import create_pool
        from arq.connections import RedisSettings

        app.state.arq_pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        log.info("arq_pool.connected")
    except Exception:
        app.state.arq_pool = None
        log.warning(
            "arq_pool.unavailable",
            note="Submissions succeed but parse jobs won't be enqueued until Redis is reachable",
        )

    yield

    pool = getattr(app.state, "arq_pool", None)
    if pool:
        await pool.aclose()


_TAGS_METADATA = [
    {"name": "public", "description": "Unauthenticated endpoints powering the careers portal — list active jobs, fetch a job by slug, and submit applications."},
    {"name": "jobs", "description": "Admin job CRUD, status transitions (draft/active/closed), form-field config, and pipeline-stage listing."},
    {"name": "applicants", "description": "Per-job applicant list, detail, stage moves, notes, manual-correction editor, re-parse, and resume signed-URL."},
    {"name": "pipeline", "description": "Per-job stage CRUD + reorder. Stage transitions are recorded in the audit log and may fire integrations."},
    {"name": "integrations", "description": "Per-job webhook configuration, delivery log, manual retry, and test-payload firing."},
    {"name": "templates", "description": "Reusable bundles of form fields + assessment questions. Snapshot-copied to a job on apply."},
    {"name": "analytics", "description": "Job-scoped aggregated metrics powering the dashboard charts."},
    {"name": "export", "description": "CSV export of applicants for a job."},
    {"name": "users", "description": "Admin-only: list staff users, invite new users, change roles."},
    {"name": "me", "description": "Current authenticated user."},
    {"name": "health", "description": "Liveness + readiness probes for orchestrators."},
    {"name": "internal:auth", "description": "Server-to-server: Auth.js calls this on sign-in to sync users and issue our session JWT."},
]

app = FastAPI(
    title="Recruitment Pipeline API",
    description=(
        "Internal + public API for the recruitment platform. Every product action "
        "(stage transitions, integrations, etc.) is exposed here so the platform "
        "can be driven entirely by external services or AI agents.\n\n"
        "**Auth:** Admin endpoints expect `Authorization: Bearer <jwt>` (HS256, signed with `AUTH_SECRET`). "
        "The `/internal/*` endpoints require `X-Internal-API-Key`. The `/public/*` endpoints are unauthenticated."
    ),
    version="0.1.0",
    lifespan=lifespan,
    openapi_tags=_TAGS_METADATA,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(internal_auth.router)
app.include_router(me.router)
app.include_router(users_admin.router)
app.include_router(templates.router)
app.include_router(jobs.router)
app.include_router(analytics.router)
app.include_router(applicants.router)
app.include_router(export.router)
app.include_router(pipeline.router)
app.include_router(integrations.router)
app.include_router(public.router)
