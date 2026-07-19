"""Background tasks for the ARQ worker.

parse_resume:
  1. Fetches the applicant row.
  2. Reads the resume bytes from local storage.
  3. Extracts raw text with pdfplumber.
  4. Extracts basic structured fields with deterministic local rules.
  5. Writes ParsedResume + child rows (education / work / skills).
  6. Updates applicant.parse_status.

All of this is best-effort and idempotent — the task can be safely re-queued
if it fails partway through.
"""
from __future__ import annotations

import asyncio
import io
import traceback
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import structlog
from sqlmodel import Session, select

from app.db import engine
from app.models._base import ParseStatus, RankStatus
from app.models.applicant import (
    Applicant,
    ApplicantCustomFieldValue,
    ApplicantEducation,
    ApplicantFitScore,
    ApplicantSkill,
    ApplicantWork,
    ParsedResume,
)
from app.models.job import Job, JobFormField
from app.services import ranking as ranking_svc
from app.services import storage as storage_svc
from app.services.resume_parser import parse_resume_text

log = structlog.get_logger()


def _extract_text(resume_bytes: bytes) -> tuple[str, int]:
    """Extract text from a PDF and return (text, page_count).

    Raises:
      ResumeUnreadable: pdfplumber couldn't open the PDF at all (corrupted,
        password-protected, malformed). Re-parsing won't help.
      ImageOnlyResume: PDF opened but produced no extractable text. Almost
        always a scanned document. OCR would be needed.
    """
    import pdfplumber

    try:
        with pdfplumber.open(io.BytesIO(resume_bytes)) as pdf:
            page_count = len(pdf.pages)
            pages = [page.extract_text() or "" for page in pdf.pages]
    except Exception as exc:
        # pdfplumber raises a variety of exceptions for malformed PDFs.
        # Treat any of them as "unreadable" rather than letting the generic
        # handler write the stack trace into parse_error.
        raise ResumeUnreadable(
            "We couldn't open this PDF. It may be corrupted, password-protected, "
            "or in an unsupported format. Ask the applicant to re-export as a "
            "standard PDF and resubmit.",
            retryable=False,
        ) from exc

    text = "\n\n".join(p.strip() for p in pages if p.strip())
    if not text.strip():
        # PDF parsed fine but yielded nothing. This is the scanned-document /
        # designer-resume-rendered-as-image case. We don't currently run OCR,
        # so this is a clear-fail with a clear remediation.
        raise ImageOnlyResume(
            "This PDF appears to contain only images (scanned or rendered as "
            "a picture), so there's no text to read. Ask the applicant for a "
            "text-based PDF — most word processors and resume builders export "
            "one by default.",
            retryable=False,
        )

    return text, page_count


class ResumeNotFound(Exception):
    """Resume file is missing from storage — re-uploading is the only fix."""


class ParseError(Exception):
    """Base class for parse failures with an admin-facing message.

    The `user_message` is what gets surfaced in the applicant detail UI
    via `parse_error`. It must be readable by a recruiter, not a stack
    trace. `retryable` tells the caller whether a click of the Re-parse
    button has any chance of succeeding."""

    def __init__(self, user_message: str, *, retryable: bool = False):
        super().__init__(user_message)
        self.user_message = user_message
        self.retryable = retryable


class ResumeUnreadable(ParseError):
    """pdfplumber couldn't open or process the PDF at all.

    Causes seen in the wild: corrupted file, password-protected, broken
    xref table, weird font encoding. Re-parsing won't help."""


class ImageOnlyResume(ParseError):
    """The PDF opened fine but yielded zero extractable text.

    Almost always a scanned document or a designer resume rendered as
    a single image. Without OCR we can't read it. The applicant needs
    to provide a text-based version."""


def _download_resume(storage_path: str) -> bytes:
    """Read resume bytes from local storage.

    Raises ResumeNotFound if the file is missing — caller treats this as a
    permanent failure rather than letting pdfplumber process empty input.
    """
    if not storage_path:
        raise ResumeNotFound("No resume on file for this applicant.")

    try:
        return storage_svc.read_file_bytes(storage_path)
    except FileNotFoundError as exc:
        raise ResumeNotFound(
            "Resume file is unavailable in local storage. Re-upload it locally."
        ) from exc


async def parse_resume(ctx: dict, *, applicant_id: str) -> str:
    """ARQ task: parse the resume for one applicant.

    Safe to re-queue: if already `parsed` we skip and return early.
    """
    log.info("parse_resume.start", applicant_id=applicant_id)

    with Session(engine) as session:
        applicant = session.get(Applicant, UUID(applicant_id))
        if applicant is None:
            log.warning("parse_resume.applicant_not_found", applicant_id=applicant_id)
            return "applicant_not_found"

        if applicant.parse_status == ParseStatus.parsed:
            log.info("parse_resume.already_parsed", applicant_id=applicant_id)
            return "already_parsed"

        # Guard against concurrent runs: if another task is already mid-parse,
        # bail out rather than racing to delete/reinsert child rows.
        if applicant.parse_status == ParseStatus.parsing:
            log.info("parse_resume.already_parsing_skip", applicant_id=applicant_id)
            return "already_parsing"

        # Mark as in-progress
        applicant.parse_status = ParseStatus.parsing
        applicant.parse_attempts += 1
        session.add(applicant)
        session.commit()
        resume_gcs_path = applicant.resume_gcs_path  # capture before session closes

    try:
        # 1. Read the locally stored file and fail fast if it is missing.
        try:
            resume_bytes = _download_resume(resume_gcs_path)
        except ResumeNotFound as e:
            log.warning(
                "parse_resume.resume_missing",
                applicant_id=applicant_id,
                path=resume_gcs_path,
            )
            with Session(engine) as session:
                app_row = session.get(Applicant, UUID(applicant_id))
                if app_row:
                    app_row.parse_status = ParseStatus.failed
                    app_row.parse_error = str(e)
                    session.add(app_row)
                    session.commit()
            return "resume_not_found"

        log.info(
            "parse_resume.downloaded",
            applicant_id=applicant_id,
            bytes=len(resume_bytes),
        )

        # 2. Extract text. Raises ResumeUnreadable or ImageOnlyResume on the
        #    two structurally-different failure modes; we let those bubble
        #    up to the typed handler below.
        resume_text, page_count = _extract_text(resume_bytes)
        log.info(
            "parse_resume.extracted",
            applicant_id=applicant_id,
            pages=page_count,
            chars=len(resume_text),
        )

        # 3. Deterministic local extraction. No model or network call.
        parsed: dict[str, Any] = parse_resume_text(resume_text)
        log.info(
            "parse_resume.local_extraction_ok",
            applicant_id=applicant_id,
            education_n=len(parsed.get("education", []) or []),
            work_n=len(parsed.get("work", []) or []),
            skills_n=len(parsed.get("skills", []) or []),
        )

        # 4. Persist results
        with Session(engine) as session:
            # Upsert ParsedResume summary row
            existing = session.get(ParsedResume, UUID(applicant_id))
            if existing:
                session.delete(existing)
                session.flush()

            session.add(
                ParsedResume(
                    applicant_id=UUID(applicant_id),
                    full_name=parsed.get("full_name"),
                    email=parsed.get("email"),
                    phone=parsed.get("phone"),
                    top_institution=parsed.get("top_institution"),
                    top_degree=parsed.get("top_degree"),
                    raw_json=parsed,
                    confidence_notes=parsed.get("confidence_notes"),
                )
            )

            # Clear old child rows then re-insert
            for Model in (ApplicantEducation, ApplicantWork, ApplicantSkill):
                old = session.exec(
                    select(Model).where(Model.applicant_id == UUID(applicant_id))  # type: ignore[attr-defined]
                ).all()
                for row in old:
                    session.delete(row)
            session.flush()

            for i, edu in enumerate(parsed.get("education", [])):
                session.add(
                    ApplicantEducation(
                        applicant_id=UUID(applicant_id),
                        institution=edu.get("institution"),
                        degree=edu.get("degree"),
                        field_of_study=edu.get("field_of_study"),
                        start_year=edu.get("start_year"),
                        end_year=edu.get("end_year"),
                        sort_order=i,
                    )
                )

            for i, work in enumerate(parsed.get("work", [])):
                session.add(
                    ApplicantWork(
                        applicant_id=UUID(applicant_id),
                        company=work.get("company"),
                        title=work.get("title"),
                        start_date=work.get("start_date"),
                        end_date=work.get("end_date"),
                        description=work.get("description"),
                        sort_order=i,
                    )
                )

            # Normalize skills: strip whitespace + dedupe case-insensitively while
            # keeping the first-seen casing (so "AWS" stays "AWS", not "aws").
            seen_lower: set[str] = set()
            for skill_str in parsed.get("skills", []):
                if not skill_str:
                    continue
                cleaned = str(skill_str).strip()[:200]
                if not cleaned:
                    continue
                key = cleaned.lower()
                if key in seen_lower:
                    continue
                seen_lower.add(key)
                session.add(
                    ApplicantSkill(
                        applicant_id=UUID(applicant_id),
                        skill=cleaned,
                    )
                )

            # Mark done
            app_row = session.get(Applicant, UUID(applicant_id))
            if app_row:
                app_row.parse_status = ParseStatus.parsed
                app_row.parse_error = None
                session.add(app_row)

            session.commit()

        # Chain: kick off deterministic fit scoring now that we have parsed data.
        try:
            redis = ctx.get("redis")
            if redis is not None:
                await redis.enqueue_job("rank_applicant", applicant_id=applicant_id)
        except Exception:
            log.exception("parse_resume.rank_enqueue_failed", applicant_id=applicant_id)

        log.info("parse_resume.success", applicant_id=applicant_id)
        return "ok"

    except ParseError as exc:
        # Typed failure — we already have an admin-friendly message and
        # a retryable hint. Surface the friendly text to the UI and log
        # the structured detail for ops.
        log.warning(
            "parse_resume.failed",
            applicant_id=applicant_id,
            error_class=type(exc).__name__,
            retryable=exc.retryable,
            message=exc.user_message,
        )
        with Session(engine) as session:
            app_row = session.get(Applicant, UUID(applicant_id))
            if app_row:
                app_row.parse_status = ParseStatus.failed
                app_row.parse_error = exc.user_message[:1900]
                session.add(app_row)
                session.commit()
        return f"failed: {type(exc).__name__}"

    except Exception as exc:
        # Untyped failure — bug in our own code. Log the full traceback, but
        # show the admin a generic-yet-honest message rather than the
        # Python error string.
        err_msg = traceback.format_exc()[-1900:]
        log.exception(
            "parse_resume.failed_unexpected",
            applicant_id=applicant_id,
            exception_class=type(exc).__name__,
        )
        with Session(engine) as session:
            app_row = session.get(Applicant, UUID(applicant_id))
            if app_row:
                app_row.parse_status = ParseStatus.failed
                app_row.parse_error = (
                    "An unexpected error occurred while parsing this resume. "
                    "Click Re-parse to try again. If the issue persists, the "
                    "underlying error has been logged for review."
                )
                session.add(app_row)
                session.commit()
        return f"failed: {err_msg}"


async def rank_applicant(_ctx: dict, *, applicant_id: str) -> str:
    """ARQ task: score applicant/job overlap with deterministic local rules.

    Reads the parsed resume + custom field values + job description, calls the
    ranking service, and upserts the ApplicantFitScore row. Always idempotent
    (overwrites prior row).
    """
    log.info("rank_applicant.start", applicant_id=applicant_id)
    aid = UUID(applicant_id)

    # Mark in-progress and gather inputs
    with Session(engine) as session:
        applicant = session.get(Applicant, aid)
        if applicant is None:
            log.warning("rank_applicant.applicant_not_found", applicant_id=applicant_id)
            return "applicant_not_found"

        job = session.get(Job, applicant.job_id)
        if job is None:
            log.warning("rank_applicant.job_not_found", applicant_id=applicant_id)
            return "job_not_found"

        parsed = session.get(ParsedResume, aid)
        if parsed is None or applicant.parse_status != ParseStatus.parsed:
            # Resume not yet parsed — mark skipped; the parse task will re-enqueue
            # this when parsing completes.
            _upsert_score(session, aid, status=RankStatus.skipped, error="resume not parsed")
            session.commit()
            return "skipped_no_parse"

        # Hydrate custom field values for richer signal
        rows = session.exec(
            select(ApplicantCustomFieldValue, JobFormField)
            .join(JobFormField, JobFormField.id == ApplicantCustomFieldValue.job_form_field_id)
            .where(ApplicantCustomFieldValue.applicant_id == aid)
        ).all()
        custom_field_values = [
            {"label": ff.label, "value": cfv.value_text or cfv.value_file_gcs_path}
            for cfv, ff in rows
        ]

        job_title = job.title
        job_description = job.description_md or ""
        parsed_resume = parsed.raw_json or {}

        # Mark in-progress
        _upsert_score(session, aid, status=RankStatus.ranking, error=None)
        session.commit()

    # Calculate outside the DB session. The scorer performs no network I/O.
    try:
        result = await asyncio.to_thread(
            ranking_svc.score_applicant,
            job_title=job_title,
            job_description=job_description,
            parsed_resume=parsed_resume,
            custom_field_values=custom_field_values,
        )
    except Exception as exc:
        log.exception("rank_applicant.failed", applicant_id=applicant_id)
        with Session(engine) as session:
            _upsert_score(session, aid, status=RankStatus.failed, error=str(exc)[:1900])
            session.commit()
        return f"failed: {exc}"

    if result is None:
        with Session(engine) as session:
            _upsert_score(session, aid, status=RankStatus.skipped, error="job description or parsed resume missing")
            session.commit()
        return "skipped"

    with Session(engine) as session:
        _upsert_score(
            session,
            aid,
            status=RankStatus.done,
            fit_score=result.get("fit_score"),
            skills_match=result.get("skills_match"),
            experience_match=result.get("experience_match"),
            trajectory=result.get("trajectory"),
            reasoning=result.get("reasoning"),
            model=result.get("model"),
            generated_at=datetime.now(timezone.utc),
            error=None,
        )
        session.commit()

    log.info("rank_applicant.success", applicant_id=applicant_id, fit=result.get("fit_score"))
    return "ok"


def _upsert_score(session: Session, applicant_id: UUID, **fields: Any) -> None:
    row = session.get(ApplicantFitScore, applicant_id)
    if row is None:
        row = ApplicantFitScore(applicant_id=applicant_id)
    for k, v in fields.items():
        setattr(row, k, v)
    session.add(row)
