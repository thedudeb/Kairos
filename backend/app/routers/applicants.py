"""Admin applicant management endpoints.

All routes require an authenticated admin or reviewer (require_admin dependency).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import cast, func, or_, Text
from sqlmodel import Session, select

from app.db import get_session
from app.models._base import ParseStatus
from app.models.applicant import (
    Applicant,
    ApplicantCustomFieldValue,
    ApplicantEducation,
    ApplicantNote,
    ApplicantSkill,
    ApplicantWork,
    ParsedResume,
)
from app.models.job import Job, JobFormField
from app.models.pipeline import PipelineStage, StageTransition
from app.models.user import User
from app.schemas.applicant import (
    ActivityEvent,
    ApplicantDetail,
    ApplicantListItem,
    CustomFieldValueOut,
    EducationOut,
    NoteCreate,
    NoteOut,
    ParsedResumeCorrection,
    ParsedResumeOut,
    SkillOut,
    StageMoveRequest,
    WorkOut,
)
from app.security import require_admin
from app.services import storage as storage_svc
from app.services.webhook import fire_webhook, trigger_integrations_for_transition

log = structlog.get_logger()

router = APIRouter(prefix="/jobs/{job_id}/applicants", tags=["applicants"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_job_or_404(session: Session, job_id: UUID) -> Job:
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


def _get_applicant_or_404(session: Session, applicant_id: UUID, job_id: UUID) -> Applicant:
    applicant = session.get(Applicant, applicant_id)
    if not applicant or applicant.job_id != job_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "applicant not found")
    return applicant


def _stage_name(session: Session, stage_id: UUID) -> str:
    stage = session.get(PipelineStage, stage_id)
    return stage.name if stage else "Unknown"


def _resume_url(storage_path: str) -> str:
    try:
        return storage_svc.get_download_url(storage_path)
    except Exception:
        return ""


def _build_parsed_resume(
    session: Session, applicant_id: UUID
) -> ParsedResumeOut | None:
    pr = session.get(ParsedResume, applicant_id)
    if not pr:
        return None

    education = session.exec(
        select(ApplicantEducation)
        .where(ApplicantEducation.applicant_id == applicant_id)
        .order_by(ApplicantEducation.sort_order)
    ).all()

    work = session.exec(
        select(ApplicantWork)
        .where(ApplicantWork.applicant_id == applicant_id)
        .order_by(ApplicantWork.sort_order)
    ).all()

    skills = session.exec(
        select(ApplicantSkill).where(ApplicantSkill.applicant_id == applicant_id)
    ).all()

    return ParsedResumeOut(
        full_name=pr.full_name,
        email=pr.email,
        phone=pr.phone,
        top_institution=pr.top_institution,
        top_degree=pr.top_degree,
        raw_json=pr.raw_json,
        confidence_notes=pr.confidence_notes,
        parsed_at=pr.parsed_at,
        education=[EducationOut.model_validate(e) for e in education],
        work=[WorkOut.model_validate(w) for w in work],
        skills=[SkillOut.model_validate(s) for s in skills],
    )


def _build_custom_fields(
    session: Session, applicant_id: UUID
) -> list[CustomFieldValueOut]:
    rows = session.exec(
        select(ApplicantCustomFieldValue).where(
            ApplicantCustomFieldValue.applicant_id == applicant_id
        )
    ).all()

    result = []
    for row in rows:
        field = session.get(JobFormField, row.job_form_field_id)
        label = field.label if field else str(row.job_form_field_id)
        file_url = None
        if row.value_file_gcs_path:
            file_url = _resume_url(row.value_file_gcs_path)
        result.append(
            CustomFieldValueOut(
                id=row.id,
                job_form_field_id=row.job_form_field_id,
                field_label=label,
                value_text=row.value_text,
                value_file_url=file_url,
            )
        )
    return result


def _build_notes(session: Session, applicant_id: UUID) -> list[NoteOut]:
    rows = session.exec(
        select(ApplicantNote)
        .where(ApplicantNote.applicant_id == applicant_id)
        .order_by(ApplicantNote.created_at.desc())
    ).all()

    result = []
    for row in rows:
        author = session.get(User, row.author_id)
        author_name = (
            author.name or author.email if author else "Unknown"
        )
        result.append(
            NoteOut(
                id=row.id,
                body=row.body,
                author_name=author_name,
                created_at=row.created_at,
            )
        )
    return result


def _build_activity(
    session: Session, applicant: Applicant
) -> list[ActivityEvent]:
    events: list[ActivityEvent] = []

    # Application received
    events.append(
        ActivityEvent(
            id=applicant.id,
            kind="application_received",
            timestamp=applicant.submitted_at,
            actor_name=None,
            detail="Application submitted",
        )
    )

    # Stage transitions
    transitions = session.exec(
        select(StageTransition)
        .where(StageTransition.applicant_id == applicant.id)
        .order_by(StageTransition.created_at)
    ).all()

    for t in transitions:
        actor = session.get(User, t.actor_id) if t.actor_id else None
        actor_name = (actor.name or actor.email) if actor else "System"
        to_stage = session.get(PipelineStage, t.to_stage_id)
        from_stage = session.get(PipelineStage, t.from_stage_id) if t.from_stage_id else None
        to_name = to_stage.name if to_stage else "?"
        if from_stage:
            detail = f'Moved from "{from_stage.name}" to "{to_name}"'
        else:
            detail = f'Placed in "{to_name}"'
        if t.notes:
            detail += f" — {t.notes}"
        events.append(
            ActivityEvent(
                id=t.id,
                kind="stage_transition",
                timestamp=t.created_at,
                actor_name=actor_name,
                detail=detail,
            )
        )

    # Notes
    notes = session.exec(
        select(ApplicantNote)
        .where(ApplicantNote.applicant_id == applicant.id)
        .order_by(ApplicantNote.created_at)
    ).all()

    for n in notes:
        author = session.get(User, n.author_id)
        author_name = (author.name or author.email) if author else "Unknown"
        events.append(
            ActivityEvent(
                id=n.id,
                kind="note",
                timestamp=n.created_at,
                actor_name=author_name,
                detail=n.body[:200],
            )
        )

    events.sort(key=lambda e: e.timestamp, reverse=True)
    return events


# ─── Available skills for this job (for filter UI) ───────────────────────────

@router.get("/skills", response_model=list[str])
def list_skills(
    job_id: UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> list[str]:
    """Return sorted list of unique skills present in this job's applicant pool."""
    _get_job_or_404(session, job_id)
    rows = session.execute(
        select(ApplicantSkill.skill)
        .join(Applicant, Applicant.id == ApplicantSkill.applicant_id)
        .where(Applicant.job_id == job_id)
        .distinct()
        .order_by(ApplicantSkill.skill)
    ).scalars().all()
    return list(rows)


# ─── List applicants ──────────────────────────────────────────────────────────

@router.get("", response_model=list[ApplicantListItem])
def list_applicants(
    job_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    # Filtering
    stage_id: UUID | None = Query(default=None),
    parse_status: ParseStatus | None = Query(default=None),
    institution: str | None = Query(default=None, max_length=300),
    degree: str | None = Query(default=None, max_length=300),
    skills: list[str] | None = Query(default=None),
    date_from: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    date_to: str | None = Query(default=None, description="ISO date YYYY-MM-DD"),
    search: str | None = Query(default=None, max_length=200),
    # Sorting
    sort_by: Literal[
        "submitted_at", "last_name", "top_institution", "top_degree", "current_stage_id"
    ] = Query(default="submitted_at"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    # Pagination
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
) -> list[ApplicantListItem]:
    _get_job_or_404(session, job_id)

    # Join ParsedResume for filter/sort on parsed fields
    q = (
        select(Applicant, ParsedResume)
        .outerjoin(ParsedResume, ParsedResume.applicant_id == Applicant.id)
        .where(Applicant.job_id == job_id)
    )

    if stage_id:
        q = q.where(Applicant.current_stage_id == stage_id)
    if parse_status:
        q = q.where(Applicant.parse_status == parse_status)
    if institution:
        q = q.where(func.lower(ParsedResume.top_institution).like(f"%{institution.lower()}%"))
    if degree:
        q = q.where(func.lower(ParsedResume.top_degree).like(f"%{degree.lower()}%"))
    if date_from:
        try:
            from datetime import date
            dt_from = datetime.fromisoformat(date_from)
            q = q.where(Applicant.submitted_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            from datetime import date
            dt_to = datetime.fromisoformat(date_to)
            q = q.where(Applicant.submitted_at <= dt_to)
        except ValueError:
            pass

    if skills:
        # Applicant must have at least one of the requested skills
        skill_subq = (
            select(ApplicantSkill.applicant_id)
            .where(
                ApplicantSkill.applicant_id == Applicant.id,
                func.lower(ApplicantSkill.skill).in_([s.lower() for s in skills]),
            )
            .exists()
        )
        q = q.where(skill_subq)

    if search:
        term = f"%{search.lower()}%"
        skill_search_subq = (
            select(ApplicantSkill.applicant_id)
            .where(
                ApplicantSkill.applicant_id == Applicant.id,
                func.lower(ApplicantSkill.skill).like(term),
            )
            .exists()
        )
        edu_search_subq = (
            select(ApplicantEducation.id)
            .where(
                ApplicantEducation.applicant_id == Applicant.id,
                or_(
                    func.lower(func.coalesce(ApplicantEducation.institution, '')).like(term),
                    func.lower(func.coalesce(ApplicantEducation.degree, '')).like(term),
                    func.lower(func.coalesce(ApplicantEducation.field_of_study, '')).like(term),
                ),
            )
            .exists()
        )
        work_search_subq = (
            select(ApplicantWork.id)
            .where(
                ApplicantWork.applicant_id == Applicant.id,
                or_(
                    func.lower(func.coalesce(ApplicantWork.company, '')).like(term),
                    func.lower(func.coalesce(ApplicantWork.title, '')).like(term),
                    func.lower(func.coalesce(ApplicantWork.description, '')).like(term),
                ),
            )
            .exists()
        )
        raw_json_like = func.lower(cast(ParsedResume.raw_json, Text)).like(term)
        q = q.where(
            or_(
                func.lower(Applicant.first_name).like(term),
                func.lower(Applicant.last_name).like(term),
                func.lower(Applicant.email).like(term),
                func.lower(func.coalesce(ParsedResume.top_institution, '')).like(term),
                func.lower(func.coalesce(ParsedResume.full_name, '')).like(term),
                func.lower(func.coalesce(ParsedResume.email, '')).like(term),
                func.lower(func.coalesce(ParsedResume.phone, '')).like(term),
                raw_json_like,
                skill_search_subq,
                edu_search_subq,
                work_search_subq,
            )
        )

    # Sorting — ParsedResume columns need the join above
    sort_col_map = {
        "submitted_at": Applicant.submitted_at,
        "last_name": Applicant.last_name,
        "top_institution": ParsedResume.top_institution,
        "top_degree": ParsedResume.top_degree,
        "current_stage_id": Applicant.current_stage_id,
    }
    sort_col = sort_col_map.get(sort_by, Applicant.submitted_at)
    if sort_dir == "asc":
        q = q.order_by(sort_col.asc())
    else:
        q = q.order_by(sort_col.desc())

    q = q.offset(offset).limit(limit)
    rows = session.execute(q).all()

    # Build a stage-name cache to avoid N+1
    stage_cache: dict[UUID, str] = {}

    result = []
    for a, pr in rows:
        if a.current_stage_id not in stage_cache:
            stage_cache[a.current_stage_id] = _stage_name(session, a.current_stage_id)
        result.append(
            ApplicantListItem(
                id=a.id,
                first_name=a.first_name,
                last_name=a.last_name,
                email=a.email,
                phone=a.phone,
                parse_status=a.parse_status,
                current_stage_id=a.current_stage_id,
                current_stage_name=stage_cache[a.current_stage_id],
                top_institution=pr.top_institution if pr else None,
                top_degree=pr.top_degree if pr else None,
                submitted_at=a.submitted_at,
                stage_entered_at=a.stage_entered_at,
                resume_url=_resume_url(a.resume_gcs_path),
            )
        )
    return result


# ─── Get applicant detail ──────────────────────────────────────────────────────

@router.get("/{applicant_id}", response_model=ApplicantDetail)
def get_applicant(
    job_id: UUID,
    applicant_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> ApplicantDetail:
    applicant = _get_applicant_or_404(session, applicant_id, job_id)

    return ApplicantDetail(
        id=applicant.id,
        job_id=applicant.job_id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email,
        phone=applicant.phone,
        parse_status=applicant.parse_status,
        parse_error=applicant.parse_error,
        parse_attempts=applicant.parse_attempts,
        current_stage_id=applicant.current_stage_id,
        current_stage_name=_stage_name(session, applicant.current_stage_id),
        submitted_at=applicant.submitted_at,
        stage_entered_at=applicant.stage_entered_at,
        resume_url=_resume_url(applicant.resume_gcs_path),
        parsed_resume=_build_parsed_resume(session, applicant.id),
        custom_fields=_build_custom_fields(session, applicant.id),
        notes=_build_notes(session, applicant.id),
        activity=_build_activity(session, applicant),
    )


@router.get("/{applicant_id}/resume")
def download_resume_pdf(
    job_id: UUID,
    applicant_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> Response:
    """Return raw PDF bytes for inline viewing (browser PDF.js). Auth required."""
    del current_user  # enforced by dependency
    _get_job_or_404(session, job_id)
    applicant = _get_applicant_or_404(session, applicant_id, job_id)

    if not applicant.resume_gcs_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "resume not found")

    try:
        data = storage_svc.read_file_bytes(applicant.resume_gcs_path)
    except FileNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "resume file missing from storage",
        ) from None
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except Exception:
        log.exception(
            "applicant.resume_read_failed",
            applicant_id=str(applicant_id),
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "could not read resume from storage",
        ) from None

    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="resume.pdf"',
            "Cache-Control": "private, max-age=120",
        },
    )


# ─── Move stage ───────────────────────────────────────────────────────────────

@router.patch("/{applicant_id}/stage", response_model=ApplicantDetail)
def move_stage(
    job_id: UUID,
    applicant_id: UUID,
    body: StageMoveRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> ApplicantDetail:
    applicant = _get_applicant_or_404(session, applicant_id, job_id)

    # Validate the new stage belongs to this job
    new_stage = session.get(PipelineStage, body.stage_id)
    if not new_stage or new_stage.job_id != job_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "stage does not belong to this job")

    from_stage_id = applicant.current_stage_id

    # Record transition
    transition = StageTransition(
        applicant_id=applicant.id,
        from_stage_id=from_stage_id,
        to_stage_id=body.stage_id,
        actor_id=current_user.id,
        notes=body.notes,
    )
    session.add(transition)
    session.flush()  # get transition.id before commit

    applicant.current_stage_id = body.stage_id
    applicant.stage_entered_at = datetime.now(timezone.utc)
    session.add(applicant)
    session.commit()
    session.refresh(applicant)

    log.info(
        "applicant.stage_moved",
        applicant_id=str(applicant.id),
        from_stage=str(from_stage_id),
        to_stage=str(body.stage_id),
        actor=str(current_user.id),
    )

    # Trigger any configured integrations (best-effort, non-blocking)
    integration_ids = trigger_integrations_for_transition(
        session,
        transition_id=transition.id,
        job_id=job_id,
        to_stage_id=body.stage_id,
    )
    for iid in integration_ids:
        background_tasks.add_task(
            fire_webhook,
            transition_id=transition.id,
            integration_id=iid,
            is_manual_retry=False,
        )

    return get_applicant(job_id, applicant_id, session, current_user)


# ─── Add note ─────────────────────────────────────────────────────────────────

@router.post("/{applicant_id}/notes", response_model=NoteOut, status_code=201)
def add_note(
    job_id: UUID,
    applicant_id: UUID,
    body: NoteCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> NoteOut:
    applicant = _get_applicant_or_404(session, applicant_id, job_id)

    note = ApplicantNote(
        applicant_id=applicant.id,
        author_id=current_user.id,
        body=body.body.strip(),
    )
    session.add(note)
    session.commit()
    session.refresh(note)

    return NoteOut(
        id=note.id,
        body=note.body,
        author_name=current_user.name or current_user.email,
        created_at=note.created_at,
    )


# ─── Edit note ────────────────────────────────────────────────────────────────

@router.put("/{applicant_id}/notes/{note_id}", response_model=NoteOut)
def edit_note(
    job_id: UUID,
    applicant_id: UUID,
    note_id: UUID,
    body: NoteCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> NoteOut:
    _get_applicant_or_404(session, applicant_id, job_id)
    note = session.get(ApplicantNote, note_id)
    if not note or note.applicant_id != applicant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "note not found")
    if note.author_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only edit your own notes")

    note.body = body.body.strip()
    session.add(note)
    session.commit()
    session.refresh(note)

    author = session.get(User, note.author_id)
    return NoteOut(
        id=note.id,
        body=note.body,
        author_name=(author.name or author.email) if author else "Unknown",
        created_at=note.created_at,
    )


# ─── Delete note ───────────────────────────────────────────────────────────────

@router.delete("/{applicant_id}/notes/{note_id}", status_code=204)
def delete_note(
    job_id: UUID,
    applicant_id: UUID,
    note_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> None:
    _get_applicant_or_404(session, applicant_id, job_id)
    note = session.get(ApplicantNote, note_id)
    if not note or note.applicant_id != applicant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "note not found")
    if note.author_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only delete your own notes")
    session.delete(note)
    session.commit()


# ─── Re-parse resume ──────────────────────────────────────────────────────────

@router.post("/{applicant_id}/reparse", status_code=202)
async def reparse_resume(
    job_id: UUID,
    applicant_id: UUID,
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> dict:
    applicant = _get_applicant_or_404(session, applicant_id, job_id)

    # Reset status so the UI shows "Parsing..."
    applicant.parse_status = ParseStatus.pending
    applicant.parse_error = None
    session.add(applicant)
    session.commit()

    pool = getattr(getattr(request, "app", None), "state", None)
    pool = getattr(pool, "arq_pool", None) if pool else None

    if pool:
        await pool.enqueue_job("parse_resume", applicant_id=str(applicant_id))
        return {"queued": True}

    log.warning("reparse.arq_pool_unavailable", applicant_id=str(applicant_id))
    return {"queued": False, "note": "Redis unavailable; set REDIS_URL to enable background parsing"}


# ─── Manual resume correction ──────────────────────────────────────────────────

@router.patch("/{applicant_id}/parsed-resume", response_model=ParsedResumeOut)
def correct_parsed_resume(
    job_id: UUID,
    applicant_id: UUID,
    body: ParsedResumeCorrection,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> ParsedResumeOut:
    """Allows admins to manually correct LLM-extracted resume fields."""
    applicant = _get_applicant_or_404(session, applicant_id, job_id)

    pr = session.get(ParsedResume, applicant_id)
    if pr is None:
        # Create a minimal record if parsing never ran
        pr = ParsedResume(applicant_id=applicant_id)
        session.add(pr)

    if body.full_name is not None:
        pr.full_name = body.full_name or None
    if body.email is not None:
        pr.email = body.email or None
    if body.phone is not None:
        pr.phone = body.phone or None
    if body.top_institution is not None:
        pr.top_institution = body.top_institution or None
    if body.top_degree is not None:
        pr.top_degree = body.top_degree or None

    session.add(pr)

    # Replace skills if provided
    if body.skills is not None:
        existing = session.exec(
            select(ApplicantSkill).where(ApplicantSkill.applicant_id == applicant_id)
        ).all()
        for s in existing:
            session.delete(s)
        for skill_name in body.skills:
            s = skill_name.strip()
            if s:
                session.add(ApplicantSkill(applicant_id=applicant_id, skill=s))

    # Mark as manually corrected
    applicant.parse_status = ParseStatus.needs_manual
    session.add(applicant)
    session.commit()
    session.refresh(pr)

    return ParsedResumeOut(
        full_name=pr.full_name,
        email=pr.email,
        phone=pr.phone,
        top_institution=pr.top_institution,
        top_degree=pr.top_degree,
        raw_json=pr.raw_json,
        education=[
            EducationOut.model_validate(e)
            for e in session.exec(
                select(ApplicantEducation)
                .where(ApplicantEducation.applicant_id == applicant_id)
                .order_by(ApplicantEducation.sort_order)
            ).all()
        ],
        work=[
            WorkOut.model_validate(w)
            for w in session.exec(
                select(ApplicantWork)
                .where(ApplicantWork.applicant_id == applicant_id)
                .order_by(ApplicantWork.sort_order)
            ).all()
        ],
        skills=[
            SkillOut.model_validate(s)
            for s in session.exec(
                select(ApplicantSkill).where(ApplicantSkill.applicant_id == applicant_id)
            ).all()
        ],
    )
