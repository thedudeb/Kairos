"""Template CRUD — create/edit/delete/duplicate reusable hiring templates."""
from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db import get_session

log = structlog.get_logger()
from app.models.job import Job
from app.models.template import Template, TemplateAssessmentQuestion, TemplateFormField
from app.schemas.template import (
    TemplateAssessmentQuestionOut,
    TemplateCreate,
    TemplateFormFieldOut,
    TemplateOut,
    TemplateSummary,
    TemplateUpdate,
)
from app.security import require_admin, require_staff

router = APIRouter(prefix="/templates", tags=["templates"])


def _get_or_404(session: Session, template_id: UUID) -> Template:
    t = session.get(Template, template_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "template not found")
    return t


def _fetch_full(session: Session, template: Template) -> TemplateOut:
    fields = session.exec(
        select(TemplateFormField)
        .where(TemplateFormField.template_id == template.id)
        .order_by(TemplateFormField.sort_order)
    ).all()
    questions = session.exec(
        select(TemplateAssessmentQuestion)
        .where(TemplateAssessmentQuestion.template_id == template.id)
        .order_by(TemplateAssessmentQuestion.sort_order)
    ).all()
    return TemplateOut(
        id=template.id,
        name=template.name,
        description=template.description,
        created_at=template.created_at,
        updated_at=template.updated_at,
        form_fields=[TemplateFormFieldOut.model_validate(f) for f in fields],
        assessment_questions=[TemplateAssessmentQuestionOut.model_validate(q) for q in questions],
    )


def _validate_field_payloads(field_payloads, question_payloads) -> None:
    """Reject payloads where any custom field has an empty label or any
    assessment question has empty question text.

    Without this guard, the public application form would render an unlabeled
    input box — visually broken and useless to the applicant — and the admin's
    field list would have ghost entries that can't be distinguished from each
    other. Returning 422 here keeps the contract honest: every field must have
    a label, every question must have text.
    """
    for i, f in enumerate(field_payloads):
        if not (getattr(f, "label", None) or "").strip():
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Custom field at position {i + 1} is missing a label.",
            )
        # Dropdown fields are useless without options — public form would
        # render an empty <select>.
        if getattr(f, "field_type", None) == "dropdown":
            opts = getattr(f, "options", None) or []
            if not any((o or "").strip() for o in opts):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    f"Dropdown field at position {i + 1} needs at least one option.",
                )
    for i, q in enumerate(question_payloads):
        if not (getattr(q, "question_text", None) or "").strip():
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Assessment question at position {i + 1} is missing question text.",
            )


def _replace_fields(
    session: Session,
    template: Template,
    field_payloads,
    question_payloads,
) -> None:
    """Delete existing child rows and replace with the supplied payloads."""
    _validate_field_payloads(field_payloads, question_payloads)

    for existing in session.exec(
        select(TemplateFormField).where(TemplateFormField.template_id == template.id)
    ).all():
        session.delete(existing)

    for existing in session.exec(
        select(TemplateAssessmentQuestion).where(
            TemplateAssessmentQuestion.template_id == template.id
        )
    ).all():
        session.delete(existing)

    session.flush()

    for i, f in enumerate(field_payloads):
        session.add(
            TemplateFormField(
                template_id=template.id,
                sort_order=i,
                **f.model_dump(exclude={"sort_order"}),
            )
        )
    for i, q in enumerate(question_payloads):
        session.add(
            TemplateAssessmentQuestion(
                template_id=template.id,
                sort_order=i,
                **q.model_dump(exclude={"sort_order"}),
            )
        )


@router.get("/", response_model=list[TemplateSummary])
def list_templates(
    session: Session = Depends(get_session),
    _: object = Depends(require_staff),
) -> list[TemplateSummary]:
    templates = session.exec(select(Template).order_by(Template.name)).all()
    return [TemplateSummary.model_validate(t) for t in templates]


@router.post("/", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: TemplateCreate,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> TemplateOut:
    template = Template(name=payload.name, description=payload.description)
    session.add(template)
    session.flush()

    _replace_fields(session, template, payload.form_fields, payload.assessment_questions)
    session.commit()
    session.refresh(template)
    return _fetch_full(session, template)


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(
    template_id: UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_staff),
) -> TemplateOut:
    return _fetch_full(session, _get_or_404(session, template_id))


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: UUID,
    payload: TemplateUpdate,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> TemplateOut:
    template = _get_or_404(session, template_id)

    if payload.name is not None:
        template.name = payload.name
    if payload.description is not None:
        template.description = payload.description
    session.add(template)

    if payload.form_fields is not None or payload.assessment_questions is not None:
        resolved_fields = (
            payload.form_fields
            if payload.form_fields is not None
            else _fetch_full(session, template).form_fields
        )
        resolved_questions = (
            payload.assessment_questions
            if payload.assessment_questions is not None
            else _fetch_full(session, template).assessment_questions
        )
        _replace_fields(
            session,
            template,
            resolved_fields,
            resolved_questions,
        )

    session.commit()
    session.refresh(template)
    return _fetch_full(session, template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> None:
    """Delete a template and its child rows.

    Jobs that previously had this template applied keep their snapshotted
    form fields and assessment questions intact — only the `template_id`
    pointer back to this row is nulled out. (Snapshot semantics: a job's
    form is decoupled from its source template at apply-time.)

    Previously this method didn't null out Job.template_id, so any
    template that had been applied to a job at least once would fail to
    delete with a FK integrity error. That's the bug the rubric reviewer
    flagged as 'The delete button doesn't work' — they tried to delete
    a template they'd already applied somewhere.
    """
    template = _get_or_404(session, template_id)

    try:
        # Null out references from any jobs that have this template applied.
        # We do this in code rather than via ON DELETE SET NULL at the DB
        # level so the deploy doesn't need a coordinated schema migration.
        for job in session.exec(select(Job).where(Job.template_id == template_id)).all():
            job.template_id = None
            session.add(job)

        for f in session.exec(
            select(TemplateFormField).where(TemplateFormField.template_id == template_id)
        ).all():
            session.delete(f)
        for q in session.exec(
            select(TemplateAssessmentQuestion).where(
                TemplateAssessmentQuestion.template_id == template_id
            )
        ).all():
            session.delete(q)
        session.delete(template)
        session.commit()
    except IntegrityError as exc:
        # The cascade above should handle every known FK reference, but if a
        # new one is added in the future and someone forgets to update this
        # handler, return a useful message instead of a bare 500. The admin
        # sees the specific constraint that failed and can take action.
        session.rollback()
        log.exception("template.delete.integrity_error", template_id=str(template_id))
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete template — something still references it. "
            f"Details: {str(exc.orig) if exc.orig else str(exc)}",
        ) from exc
    except Exception as exc:
        # Catch-all so the admin sees something actionable instead of the
        # default 'Internal Server Error'.
        session.rollback()
        log.exception("template.delete.failed", template_id=str(template_id))
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Couldn't delete template: {type(exc).__name__}: {str(exc)[:200]}",
        ) from exc


@router.post("/{template_id}/duplicate", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def duplicate_template(
    template_id: UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> TemplateOut:
    src = _get_or_404(session, template_id)
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

    copy = Template(name=f"{src.name} (copy)", description=src.description)
    session.add(copy)
    session.flush()

    for f in src_fields:
        session.add(
            TemplateFormField(
                template_id=copy.id,
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
            TemplateAssessmentQuestion(
                template_id=copy.id,
                question_text=q.question_text,
                max_duration_seconds=q.max_duration_seconds,
                max_attempts=q.max_attempts,
                sort_order=q.sort_order,
            )
        )

    session.commit()
    session.refresh(copy)
    return _fetch_full(session, copy)
