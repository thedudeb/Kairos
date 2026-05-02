"""Pipeline stage management endpoints.

Covers stage CRUD and bulk reorder for a job's hiring pipeline.
Applicant stage moves live in applicants.py (they record a StageTransition).
"""
from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.models.applicant import Applicant
from app.models.pipeline import PipelineStage
from app.models.job import Job
from app.security import require_admin, require_staff
from app.models.user import User

log = structlog.get_logger()

router = APIRouter(prefix="/jobs/{job_id}/pipeline", tags=["pipeline"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class StageOut(BaseModel):
    id: UUID
    job_id: UUID
    name: str
    sort_order: int
    is_terminal: bool
    applicant_count: int = 0


class StageCreate(BaseModel):
    name: str
    is_terminal: bool = False


class StageUpdate(BaseModel):
    name: str | None = None
    is_terminal: bool | None = None


class StageReorderItem(BaseModel):
    id: UUID
    sort_order: int


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_job_or_404(session: Session, job_id: UUID) -> Job:
    job = session.get(Job, job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


def _get_stage_or_404(session: Session, stage_id: UUID, job_id: UUID) -> PipelineStage:
    stage = session.get(PipelineStage, stage_id)
    if not stage or stage.job_id != job_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "stage not found")
    return stage


def _applicant_counts(session: Session, job_id: UUID) -> dict[UUID, int]:
    rows = session.execute(
        select(Applicant.current_stage_id, func.count().label("cnt"))
        .where(Applicant.job_id == job_id)
        .group_by(Applicant.current_stage_id)
    ).all()
    return {row.current_stage_id: row.cnt for row in rows}


def _to_out(stage: PipelineStage, counts: dict[UUID, int]) -> StageOut:
    return StageOut(
        id=stage.id,
        job_id=stage.job_id,
        name=stage.name,
        sort_order=stage.sort_order,
        is_terminal=stage.is_terminal,
        applicant_count=counts.get(stage.id, 0),
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/stages", response_model=list[StageOut])
def list_stages(
    job_id: UUID,
    session: Session = Depends(get_session),
    _: User = Depends(require_staff),
) -> list[StageOut]:
    _get_job_or_404(session, job_id)
    stages = session.exec(
        select(PipelineStage)
        .where(PipelineStage.job_id == job_id)
        .order_by(PipelineStage.sort_order)
    ).all()
    counts = _applicant_counts(session, job_id)
    return [_to_out(s, counts) for s in stages]


@router.post("/stages", response_model=StageOut, status_code=201)
def create_stage(
    job_id: UUID,
    body: StageCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> StageOut:
    _get_job_or_404(session, job_id)
    # Place at end
    max_order = session.execute(
        select(func.coalesce(func.max(PipelineStage.sort_order), -1))
        .where(PipelineStage.job_id == job_id)
    ).scalar_one()
    stage = PipelineStage(
        job_id=job_id,
        name=body.name.strip(),
        sort_order=max_order + 1,
        is_terminal=body.is_terminal,
    )
    session.add(stage)
    session.commit()
    session.refresh(stage)
    return _to_out(stage, {})


@router.put("/stages/{stage_id}", response_model=StageOut)
def update_stage(
    job_id: UUID,
    stage_id: UUID,
    body: StageUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> StageOut:
    stage = _get_stage_or_404(session, stage_id, job_id)
    if body.name is not None:
        stage.name = body.name.strip()
    if body.is_terminal is not None:
        stage.is_terminal = body.is_terminal
    session.add(stage)
    session.commit()
    session.refresh(stage)
    counts = _applicant_counts(session, job_id)
    return _to_out(stage, counts)


@router.delete("/stages/{stage_id}", status_code=204)
def delete_stage(
    job_id: UUID,
    stage_id: UUID,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> None:
    stage = _get_stage_or_404(session, stage_id, job_id)

    # Cannot delete if applicants are currently in this stage
    count = session.execute(
        select(func.count())
        .select_from(Applicant)
        .where(Applicant.current_stage_id == stage_id)
    ).scalar_one()
    if count:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete stage: {count} applicant(s) are currently in it. "
            "Move them to another stage first.",
        )

    # Must keep at least one stage
    total = session.execute(
        select(func.count())
        .select_from(PipelineStage)
        .where(PipelineStage.job_id == job_id)
    ).scalar_one()
    if total <= 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Cannot delete the last pipeline stage."
        )

    session.delete(stage)
    session.commit()


@router.put("/stages", response_model=list[StageOut])
def reorder_stages(
    job_id: UUID,
    body: list[StageReorderItem],
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> list[StageOut]:
    """Bulk update sort_order for all stages in a job."""
    _get_job_or_404(session, job_id)
    id_to_order = {item.id: item.sort_order for item in body}
    stages = session.exec(
        select(PipelineStage).where(PipelineStage.job_id == job_id)
    ).all()

    known_ids = {s.id for s in stages}
    unknown_ids = set(id_to_order) - known_ids
    if unknown_ids:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Stage IDs not found in this job: {[str(i) for i in unknown_ids]}",
        )

    for s in stages:
        if s.id in id_to_order:
            s.sort_order = id_to_order[s.id]
            session.add(s)
    session.commit()
    counts = _applicant_counts(session, job_id)
    return [_to_out(s, counts) for s in sorted(stages, key=lambda x: x.sort_order)]
