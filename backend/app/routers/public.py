"""Public-facing endpoints — no authentication required.

These are called directly by the careers site (applicant-facing) and are
intentionally kept separate from the admin API so rate-limiting, CORS, and
audit logging can be scoped differently in future.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import EmailStr
from sqlalchemy import func
from sqlmodel import Session, select

from app.config import settings
from app.db import get_session
from app.limiter import limiter
from app.models._base import JobStatus, ParseStatus
from app.models.applicant import Applicant, ApplicantCustomFieldValue
from app.models.job import Job, JobFormField
from app.models.pipeline import PipelineStage
from app.schemas.public import ApplicantSubmissionResponse, PublicFormField, PublicJobListItem, PublicJobResponse
from app.services import email as email_svc
from app.services import storage as storage_svc

log = structlog.get_logger()

router = APIRouter(prefix="/public", tags=["public"])

_MAX_RESUME_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_RESUME_TYPES = {"application/pdf"}
_PDF_MAGIC = b"%PDF-"

_MAX_CUSTOM_FILE_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_CUSTOM_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
# Magic bytes map: content-type → accepted leading byte sequences
_CUSTOM_MAGIC: dict[str, list[bytes]] = {
    "application/pdf": [b"%PDF-"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG"],
    "image/webp": [],  # checked separately (RIFF....WEBP)
    "application/msword": [b"\xd0\xcf\x11\xe0"],  # OLE2 compound doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [b"PK\x03\x04"],
}

# ─── Job info ─────────────────────────────────────────────────────────────────


def _get_active_job_or_raise(session: Session, slug: str) -> Job:
    job = session.exec(select(Job).where(Job.slug == slug)).first()
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


@router.get("/jobs/{slug}", response_model=PublicJobResponse)
def get_public_job(slug: str, session: Session = Depends(get_session)) -> PublicJobResponse:
    """Return public job info. Draft jobs return 404 (not published yet)."""
    job = _get_active_job_or_raise(session, slug)

    if job.status == JobStatus.draft:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")

    form_fields = session.exec(
        select(JobFormField)
        .where(JobFormField.job_id == job.id)
        .order_by(JobFormField.sort_order)
    ).all()

    return PublicJobResponse(
        id=job.id,
        title=job.title,
        slug=job.slug,
        status=job.status,
        description_md=job.description_md,
        description_kind=job.description_kind,
        description_external_url=job.description_external_url,
        description_summary=job.description_summary,
        form_fields=[PublicFormField.model_validate(f) for f in form_fields],
    )


@router.get("/jobs-active", response_model=list[PublicJobListItem])
def list_active_jobs(session: Session = Depends(get_session)) -> list[PublicJobListItem]:
    """Published jobs accepting applications — used by the optional `/careers` index page."""
    rows = session.exec(
        select(Job)
        .where(Job.status == JobStatus.active)
        .order_by(Job.title)
    ).all()
    return [PublicJobListItem(slug=j.slug, title=j.title) for j in rows]


# ─── Application submission ───────────────────────────────────────────────────


@router.post(
    "/jobs/{slug}/apply",
    response_model=ApplicantSubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/hour")
async def submit_application(
    slug: str,
    request: Request,
    session: Session = Depends(get_session),
    # Default required fields
    first_name: Annotated[str, Form(max_length=100)] = ...,
    last_name: Annotated[str, Form(max_length=100)] = ...,
    email: Annotated[EmailStr, Form()] = ...,
    phone: Annotated[str, Form(max_length=30)] = ...,
    resume: Annotated[UploadFile, File()] = ...,
) -> ApplicantSubmissionResponse:
    job = _get_active_job_or_raise(session, slug)

    if job.status == JobStatus.closed:
        raise HTTPException(
            status.HTTP_410_GONE,
            "This position is no longer accepting applications.",
        )
    if job.status == JobStatus.draft:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")

    # ── Duplicate-email check (per-job) ──────────────────────────────────────
    existing = session.execute(
        select(func.count())
        .select_from(Applicant)
        .where(Applicant.job_id == job.id, Applicant.email == email.lower().strip())
    ).scalar_one()

    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An application with this email already exists for this position.",
        )

    # ── Resume validation ─────────────────────────────────────────────────────
    resume_bytes = await resume.read()
    if len(resume_bytes) > _MAX_RESUME_BYTES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Resume file too large (max {_MAX_RESUME_BYTES // 1024 // 1024} MB).",
        )
    content_type = resume.content_type or "application/octet-stream"
    if content_type not in _ALLOWED_RESUME_TYPES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Only PDF resumes are accepted.",
        )
    # Validate PDF magic bytes — don't trust client-supplied Content-Type alone
    if not resume_bytes.startswith(_PDF_MAGIC):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "File does not appear to be a valid PDF.",
        )

    # ── Find the first pipeline stage (Applied) ───────────────────────────────
    first_stage = session.exec(
        select(PipelineStage)
        .where(PipelineStage.job_id == job.id)
        .order_by(PipelineStage.sort_order)
    ).first()

    if first_stage is None:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Job pipeline not configured. Please contact the recruiter.",
        )

    # ── Upload resume ─────────────────────────────────────────────────────────
    applicant_id = UUID(int=0)  # placeholder; replaced after DB insert below
    # We need the applicant ID for the storage path, so we insert first then upload.
    applicant = Applicant(
        job_id=job.id,
        current_stage_id=first_stage.id,
        first_name=first_name.strip(),
        last_name=last_name.strip(),
        email=email.lower().strip(),
        phone=phone.strip(),
        resume_gcs_path="",  # filled in after upload
        parse_status=ParseStatus.pending,
    )
    session.add(applicant)
    session.flush()  # get the real applicant.id

    resume_path = storage_svc.make_resume_path(
        str(job.id), str(applicant.id), resume.filename or "resume.pdf"
    )

    try:
        gcs_path = storage_svc.upload_file(
            data=resume_bytes,
            destination_path=resume_path,
            content_type=content_type,
        )
    except Exception:
        log.exception("resume.upload_failed", applicant_id=str(applicant.id))
        session.rollback()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Failed to upload resume. Please try again.",
        )

    applicant.resume_gcs_path = gcs_path
    session.add(applicant)

    # ── Custom field values ───────────────────────────────────────────────────
    custom_fields = session.exec(
        select(JobFormField)
        .where(JobFormField.job_id == job.id)
        .order_by(JobFormField.sort_order)
    ).all()

    # Parse multipart form for custom field values.
    form_data = await request.form()

    for field in custom_fields:
        field_key = f"custom_{field.id}"
        file_key = f"custom_file_{field.id}"

        if field.field_type == "file":
            raw = form_data.get(file_key)
            if raw and isinstance(raw, UploadFile):
                file_bytes = await raw.read()
                if file_bytes:
                    # Enforce size and content-type limits on custom file uploads
                    if len(file_bytes) > _MAX_CUSTOM_FILE_BYTES:
                        raise HTTPException(
                            status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"Uploaded file exceeds maximum size of {_MAX_CUSTOM_FILE_BYTES // 1024 // 1024} MB.",
                        )
                    file_ct = raw.content_type or "application/octet-stream"
                    allowed_mimes = (
                        _ALLOWED_CUSTOM_TYPES
                        if not field.file_allowed_types
                        else frozenset(field.file_allowed_types)
                    )
                    if file_ct not in allowed_mimes:
                        raise HTTPException(
                            status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "File type not allowed for this field.",
                        )
                    # Validate magic bytes — don't trust client-supplied Content-Type
                    magic_sigs = _CUSTOM_MAGIC.get(file_ct, [])
                    if magic_sigs and not any(file_bytes.startswith(sig) for sig in magic_sigs):
                        # Special case: WebP = RIFF????WEBP
                        if file_ct == "image/webp" and not (
                            file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP"
                        ):
                            raise HTTPException(
                                status.HTTP_422_UNPROCESSABLE_ENTITY,
                                "File contents do not match the declared type.",
                            )
                        elif file_ct != "image/webp":
                            raise HTTPException(
                                status.HTTP_422_UNPROCESSABLE_ENTITY,
                                "File contents do not match the declared type.",
                            )
                    cfile_path = f"custom-files/{job.id}/{applicant.id}/{field.id}"
                    try:
                        cpath = storage_svc.upload_file(
                            data=file_bytes,
                            destination_path=cfile_path,
                            content_type=file_ct,
                        )
                        session.add(
                            ApplicantCustomFieldValue(
                                applicant_id=applicant.id,
                                job_form_field_id=field.id,
                                value_file_gcs_path=cpath,
                            )
                        )
                    except Exception:
                        log.warning("custom_file.upload_failed", field_id=str(field.id))
        else:
            value = form_data.get(field_key)
            if value is not None:
                session.add(
                    ApplicantCustomFieldValue(
                        applicant_id=applicant.id,
                        job_form_field_id=field.id,
                        value_text=str(value),
                    )
                )

    session.commit()
    session.refresh(applicant)

    # ── Enqueue parse job (best-effort) ───────────────────────────────────────
    _try_enqueue_parse(request, str(applicant.id))

    # ── Confirmation email (best-effort, does not block) ─────────────────────
    applicant_name = f"{applicant.first_name} {applicant.last_name}".strip()
    try:
        email_svc.send_application_confirmation(
            to=applicant.email,
            applicant_name=applicant_name,
            job_title=job.title,
        )
    except Exception:
        log.exception("email.send_failed_post_commit", applicant_id=str(applicant.id))

    log.info(
        "application.submitted",
        applicant_id=str(applicant.id),
        job_id=str(job.id),
        email=applicant.email,
    )

    return ApplicantSubmissionResponse(id=applicant.id)


def _try_enqueue_parse(request: Request, applicant_id: str) -> None:
    """Fire-and-forget: enqueue the resume-parse ARQ job if the pool is available."""
    pool = getattr(getattr(request, "app", None), "state", None)
    pool = getattr(pool, "arq_pool", None) if pool else None
    if pool is None:
        log.warning("arq_pool.unavailable", note="Parse job not enqueued; add REDIS_URL")
        return

    async def _enqueue() -> None:
        try:
            await pool.enqueue_job("parse_resume", applicant_id=applicant_id)
            log.info("parse_job.enqueued", applicant_id=applicant_id)
        except Exception:
            log.exception("parse_job.enqueue_failed", applicant_id=applicant_id)

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(_enqueue())
    except RuntimeError:
        pass


# ─── Local file serving (dev only) ────────────────────────────────────────────


@router.get("/files/{filename}")
def serve_local_file(filename: str) -> FileResponse:
    """Serve files saved to /tmp/recruitment-uploads in local dev mode only.

    This endpoint is disabled in production — GCS signed URLs are used instead.
    """
    if settings.environment == "production":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")

    local_path = Path("/tmp/recruitment-uploads") / filename
    if not local_path.exists() or not local_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "file not found")
    # Prevent directory traversal
    try:
        local_path.resolve().relative_to(Path("/tmp/recruitment-uploads").resolve())
    except ValueError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")

    return FileResponse(str(local_path))
