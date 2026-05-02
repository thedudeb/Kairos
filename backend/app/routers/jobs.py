"""Job CRUD — each job is a fully independent hiring workspace."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import case, func
from sqlmodel import Session, select

from app.db import get_session
from app.models._base import JobDescriptionKind, JobStatus, RankStatus
from app.models.applicant import Applicant, ApplicantFitScore
from app.models.integration import JobIntegration
from app.models.job import Job, JobAssessmentQuestion, JobFormField
from app.models.pipeline import PipelineStage
from app.models.template import Template, TemplateAssessmentQuestion, TemplateFormField
from app.schemas.job import (
    ApplyTemplateRequest,
    JobAssessmentQuestionOut,
    JobCreate,
    JobFormFieldOut,
    JobListItem,
    JobOut,
    JobStatusUpdate,
    JobSummary,
    JobUpdate,
    StageDistributionItem,
)
from app.security import require_admin, require_staff
from app.utils.slug import unique_job_slug
from app.utils.url import assert_https_document_url

router = APIRouter(prefix="/jobs", tags=["jobs"])

DEFAULT_STAGES = [
    ("Applied", 0, False),
    ("Screening", 1, False),
    ("Assessment", 2, False),
    ("Interview", 3, False),
    ("Offer", 4, False),
    ("Hired", 5, True),
    ("Rejected", 6, True),
]


def _get_or_404(session: Session, job_id: UUID) -> Job:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


def _get_summary(session: Session, job_id: UUID) -> JobSummary:
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    row = session.execute(
        select(
            func.count(Applicant.id).label("total"),
            func.count(case((Applicant.submitted_at >= week_ago, 1))).label("this_week"),
            func.count(case((Applicant.submitted_at >= month_ago, 1))).label("this_month"),
        ).where(Applicant.job_id == job_id)
    ).one()

    stage_rows = session.execute(
        select(
            PipelineStage.id,
            PipelineStage.name,
            func.count(Applicant.id).label("cnt"),
        )
        .outerjoin(Applicant, Applicant.current_stage_id == PipelineStage.id)
        .where(PipelineStage.job_id == job_id)
        .group_by(PipelineStage.id, PipelineStage.name, PipelineStage.sort_order)
        .order_by(PipelineStage.sort_order)
    ).all()

    return JobSummary(
        total_applicants=row.total,
        new_this_week=row.this_week,
        new_this_month=row.this_month,
        stage_distribution=[
            StageDistributionItem(stage_id=r.id, stage_name=r.name, count=r.cnt)
            for r in stage_rows
        ],
    )


def _get_form_fields(session: Session, job_id: UUID) -> list[JobFormFieldOut]:
    rows = session.exec(
        select(JobFormField)
        .where(JobFormField.job_id == job_id)
        .order_by(JobFormField.sort_order)
    ).all()
    return [JobFormFieldOut.model_validate(r) for r in rows]


def _get_assessment_questions(session: Session, job_id: UUID) -> list[JobAssessmentQuestionOut]:
    rows = session.exec(
        select(JobAssessmentQuestion)
        .where(JobAssessmentQuestion.job_id == job_id)
        .order_by(JobAssessmentQuestion.sort_order)
    ).all()
    return [JobAssessmentQuestionOut.model_validate(r) for r in rows]


def _fetch_full(session: Session, job: Job) -> JobOut:
    return JobOut(
        id=job.id,
        title=job.title,
        slug=job.slug,
        description_md=job.description_md,
        description_kind=job.description_kind,
        description_external_url=job.description_external_url,
        description_summary=job.description_summary,
        status=job.status,
        template_id=job.template_id,
        created_at=job.created_at,
        updated_at=job.updated_at,
        form_fields=_get_form_fields(session, job.id),
        assessment_questions=_get_assessment_questions(session, job.id),
        summary=_get_summary(session, job.id),
    )


def _replace_job_fields(session: Session, job_id: UUID, field_payloads, question_payloads) -> None:
    for f in session.exec(select(JobFormField).where(JobFormField.job_id == job_id)).all():
        session.delete(f)
    for q in session.exec(
        select(JobAssessmentQuestion).where(JobAssessmentQuestion.job_id == job_id)
    ).all():
        session.delete(q)
    session.flush()

    for i, f in enumerate(field_payloads):
        session.add(
            JobFormField(
                job_id=job_id,
                sort_order=i,
                **f.model_dump(exclude={"sort_order"}),
            )
        )
    for i, q in enumerate(question_payloads):
        session.add(
            JobAssessmentQuestion(
                job_id=job_id,
                sort_order=i,
                **q.model_dump(exclude={"sort_order"}),
            )
        )


def _seed_pipeline_stages(session: Session, job_id: UUID) -> None:
    for name, order, is_terminal in DEFAULT_STAGES:
        session.add(
            PipelineStage(
                job_id=job_id,
                name=name,
                sort_order=order,
                is_terminal=is_terminal,
            )
        )


def _snapshot_template(session: Session, job: Job, template_id: UUID) -> None:
    """Copy a template's fields + questions onto a job (snapshot, not linked)."""
    tmpl = session.get(Template, template_id)
    if tmpl is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template not found")

    src_fields = session.exec(
        select(TemplateFormField)
        .where(TemplateFormField.template_id == template_id)
        .order_by(TemplateFormField.sort_order)
    ).all()
    src_questions = session.exec(
        select(TemplateAssessmentQuestion)
        .where(TemplateAssessmentQuestion.template_id == template_id)
        .order_by(TemplateAssessmentQuestion.sort_order)
    ).all()

    for f in session.exec(select(JobFormField).where(JobFormField.job_id == job.id)).all():
        session.delete(f)
    for q in session.exec(
        select(JobAssessmentQuestion).where(JobAssessmentQuestion.job_id == job.id)
    ).all():
        session.delete(q)
    session.flush()

    for f in src_fields:
        session.add(
            JobFormField(
                job_id=job.id,
                label=f.label,
                field_type=f.field_type,
                is_required=f.is_required,
                options=f.options,
                file_allowed_types=f.file_allowed_types,
                sort_order=f.sort_order,
            )
        )
    for q in src_questions:
        session.add(
            JobAssessmentQuestion(
                job_id=job.id,
                question_text=q.question_text,
                max_duration_seconds=q.max_duration_seconds,
                max_attempts=q.max_attempts,
                sort_order=q.sort_order,
            )
        )

    job.template_id = template_id
    session.add(job)


@router.get("/", response_model=list[JobListItem])
def list_jobs(
    session: Session = Depends(get_session),
    _: object = Depends(require_staff),
) -> list[JobListItem]:
    jobs = session.exec(select(Job).order_by(Job.created_at.desc())).all()
    return [
        JobListItem(
            id=job.id,
            title=job.title,
            slug=job.slug,
            status=job.status,
            template_id=job.template_id,
            created_at=job.created_at,
            summary=_get_summary(session, job.id),
        )
        for job in jobs
    ]


@router.post("/", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    payload: JobCreate,
    session: Session = Depends(get_session),
    admin=Depends(require_admin),
) -> JobOut:
    slug = payload.slug or unique_job_slug(session, payload.title)

    # Check slug uniqueness (when admin supplied their own)
    if session.execute(
        select(func.count()).select_from(Job).where(Job.slug == slug)
    ).scalar_one():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"slug '{slug}' is already taken; pick a different one",
        )

    job = Job(
        title=payload.title,
        slug=slug,
        description_md=payload.description_md,
        description_kind=payload.description_kind,
        description_external_url=payload.description_external_url,
        description_summary=payload.description_summary,
        status=payload.status,
        created_by_id=admin.id,
    )
    if job.description_kind == JobDescriptionKind.external:
        if not job.description_external_url:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "description_external_url is required when description_kind is external",
            )
        try:
            assert_https_document_url(job.description_external_url)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    session.add(job)
    session.flush()

    _seed_pipeline_stages(session, job.id)

    if payload.template_id:
        _snapshot_template(session, job, payload.template_id)

    session.commit()
    session.refresh(job)
    return _fetch_full(session, job)


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_staff),
) -> JobOut:
    return _fetch_full(session, _get_or_404(session, job_id))


@router.put("/{job_id}", response_model=JobOut)
def update_job(
    job_id: UUID,
    payload: JobUpdate,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> JobOut:
    job = _get_or_404(session, job_id)

    if payload.title is not None:
        job.title = payload.title

    if payload.slug is not None:
        # Ensure the new slug isn't taken by another job
        if session.execute(
            select(func.count())
            .select_from(Job)
            .where(Job.slug == payload.slug, Job.id != job_id)
        ).scalar_one():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"slug '{payload.slug}' is already taken",
            )
        job.slug = payload.slug

    if payload.description_md is not None:
        job.description_md = payload.description_md
    if payload.description_kind is not None:
        job.description_kind = payload.description_kind
    if payload.description_external_url is not None:
        job.description_external_url = payload.description_external_url
    if payload.description_summary is not None:
        job.description_summary = payload.description_summary

    if job.description_kind == JobDescriptionKind.external:
        if not job.description_external_url:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "External job description requires description_external_url (HTTPS).",
            )
        try:
            assert_https_document_url(job.description_external_url)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    session.add(job)

    # Merge the two independent field-list updates so we never clobber one when only
    # the other was provided.
    new_fields = payload.form_fields
    new_questions = payload.assessment_questions

    if new_fields is not None or new_questions is not None:
        # Fetch whichever half wasn't included in the payload so we can preserve it.
        resolved_fields = new_fields if new_fields is not None else _get_form_fields(session, job_id)
        resolved_questions = new_questions if new_questions is not None else _get_assessment_questions(session, job_id)
        _replace_job_fields(session, job_id, resolved_fields, resolved_questions)

    session.commit()
    session.refresh(job)
    return _fetch_full(session, job)


@router.patch("/{job_id}/status", response_model=JobOut)
def update_job_status(
    job_id: UUID,
    payload: JobStatusUpdate,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> JobOut:
    job = _get_or_404(session, job_id)
    job.status = payload.status
    session.add(job)
    session.commit()
    session.refresh(job)
    return _fetch_full(session, job)


@router.post("/{job_id}/apply-template", response_model=JobOut)
def apply_template(
    job_id: UUID,
    payload: ApplyTemplateRequest,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> JobOut:
    job = _get_or_404(session, job_id)
    _snapshot_template(session, job, payload.template_id)
    session.commit()
    session.refresh(job)
    return _fetch_full(session, job)


@router.put("/{job_id}/form-fields", response_model=list[JobFormFieldOut])
def replace_form_fields(
    job_id: UUID,
    payload: list[JobFormFieldOut],
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> list[JobFormFieldOut]:
    """Replace the entire ordered set of custom form fields for a job."""
    _get_or_404(session, job_id)
    _replace_job_fields(session, job_id, payload, _get_assessment_questions(session, job_id))
    session.commit()
    return _get_form_fields(session, job_id)


@router.put("/{job_id}/assessment-questions", response_model=list[JobAssessmentQuestionOut])
def replace_assessment_questions(
    job_id: UUID,
    payload: list[JobAssessmentQuestionOut],
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> list[JobAssessmentQuestionOut]:
    """Replace the entire ordered set of assessment questions for a job."""
    _get_or_404(session, job_id)
    _replace_job_fields(session, job_id, _get_form_fields(session, job_id), payload)
    session.commit()
    return _get_assessment_questions(session, job_id)


@router.get("/{job_id}/pipeline-stages")
def list_pipeline_stages(
    job_id: UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_staff),
) -> list[dict]:
    _get_or_404(session, job_id)
    stages = session.exec(
        select(PipelineStage)
        .where(PipelineStage.job_id == job_id)
        .order_by(PipelineStage.sort_order)
    ).all()
    return [
        {
            "id": str(s.id),
            "job_id": str(s.job_id),
            "name": s.name,
            "sort_order": s.sort_order,
            "is_terminal": s.is_terminal,
        }
        for s in stages
    ]


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> None:
    job = _get_or_404(session, job_id)

    applicant_count = session.execute(
        select(func.count()).select_from(Applicant).where(Applicant.job_id == job_id)
    ).scalar_one()
    if applicant_count:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Cannot delete a job that already has applicants. Close it instead to preserve applicant data.",
        )

    # Cascade-delete configuration rows for empty jobs.
    for model_cls, fk_col in [
        (JobFormField, JobFormField.job_id),
        (JobAssessmentQuestion, JobAssessmentQuestion.job_id),
        (JobIntegration, JobIntegration.job_id),
        (PipelineStage, PipelineStage.job_id),
    ]:
        for row in session.exec(select(model_cls).where(fk_col == job_id)).all():
            session.delete(row)
    session.delete(job)
    session.commit()


@router.post("/{job_id}/rerank-all", status_code=202)
async def rerank_all_applicants(
    job_id: UUID,
    request: Request,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> dict:
    """Re-score every applicant in this job — useful after editing the description."""
    _get_or_404(session, job_id)

    applicant_ids = [
        a.id for a in session.exec(select(Applicant).where(Applicant.job_id == job_id)).all()
    ]
    # Mark all as pending so the UI shows the spinner
    for aid in applicant_ids:
        score = session.get(ApplicantFitScore, aid)
        if score is None:
            score = ApplicantFitScore(applicant_id=aid)
        score.status = RankStatus.pending
        score.error = None
        session.add(score)
    session.commit()

    pool = getattr(getattr(request, "app", None), "state", None)
    pool = getattr(pool, "arq_pool", None) if pool else None
    queued = 0
    if pool:
        for aid in applicant_ids:
            await pool.enqueue_job("rank_applicant", applicant_id=str(aid))
            queued += 1
    return {"queued": queued, "total": len(applicant_ids)}
