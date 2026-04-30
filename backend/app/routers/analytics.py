"""Per-job analytics for the admin dashboard charts."""
from __future__ import annotations

from datetime import date as DateType
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import cast, func, Date
from sqlmodel import Session, select

from app.db import get_session
from app.models._base import ParseStatus
from app.models.applicant import Applicant, ParsedResume
from app.models.pipeline import PipelineStage
from app.security import require_admin

router = APIRouter(prefix="/jobs/{job_id}/analytics", tags=["analytics"])


# ─── Response schema ──────────────────────────────────────────────────────────

class DayCount(BaseModel):
    date: str       # YYYY-MM-DD
    count: int


class NamedCount(BaseModel):
    name: str
    count: int


class AnalyticsOut(BaseModel):
    total_applicants: int
    volume_days: int  # number of calendar days in volume_by_day
    volume_range_start: str  # YYYY-MM-DD inclusive
    volume_range_end: str    # YYYY-MM-DD inclusive
    volume_by_day: list[DayCount]
    stage_distribution: list[NamedCount]   # ordered by pipeline position
    top_institutions: list[NamedCount]     # top 8
    degree_distribution: list[NamedCount]  # top 8
    parse_status_distribution: list[NamedCount]


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.get("", response_model=AnalyticsOut)
def get_analytics(
    job_id: UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
    volume_days: int | None = Query(
        default=None,
        ge=7,
        le=366,
        description="Rolling window ending today when volume_from/volume_to omitted",
    ),
    volume_from: DateType | None = Query(default=None, description="Inclusive start (YYYY-MM-DD)"),
    volume_to: DateType | None = Query(default=None, description="Inclusive end (YYYY-MM-DD), capped at today"),
) -> AnalyticsOut:
    today = datetime.now(timezone.utc).date()

    if volume_from is not None or volume_to is not None:
        if volume_from is None or volume_to is None:
            raise HTTPException(
                status_code=422,
                detail="Provide both volume_from and volume_to for a custom range.",
            )
        range_end = min(volume_to, today)
        range_start = volume_from
        if range_start > range_end:
            raise HTTPException(
                status_code=422,
                detail="volume_from must be on or before volume_to (after capping end to today).",
            )
        span = (range_end - range_start).days + 1
        if span > 366:
            raise HTTPException(status_code=422, detail="Date range cannot exceed 366 days.")
        num_days = span
    else:
        vd = volume_days if volume_days is not None else 30
        range_end = today
        range_start = range_end - timedelta(days=vd - 1)
        num_days = vd

    rs_str = range_start.strftime("%Y-%m-%d")
    re_str = range_end.strftime("%Y-%m-%d")
    total: int = session.execute(
        select(func.count())
        .select_from(Applicant)
        .where(Applicant.job_id == job_id)
    ).scalar_one()

    # ── Volume by day (calendar days in [range_start, range_end]) ──────────────
    day_col = cast(Applicant.submitted_at, Date)
    raw_volume = session.execute(
        select(
            day_col.label("day"),
            func.count().label("cnt"),
        )
        .where(
            Applicant.job_id == job_id,
            day_col >= range_start,
            day_col <= range_end,
        )
        .group_by("day")
        .order_by("day")
    ).all()

    # Fill in zero-count days so charts are continuous
    day_map: dict[str, int] = {str(r.day): r.cnt for r in raw_volume}
    volume_by_day: list[DayCount] = []
    for i in range(num_days):
        d = range_start + timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        volume_by_day.append(DayCount(date=ds, count=day_map.get(ds, 0)))

    # ── Stage distribution (ordered by pipeline sort_order) ───────────────────
    stage_rows = session.execute(
        select(
            PipelineStage.name,
            PipelineStage.sort_order,
            func.count(Applicant.id).label("cnt"),
        )
        .join(Applicant, Applicant.current_stage_id == PipelineStage.id, isouter=True)
        .where(
            PipelineStage.job_id == job_id,
        )
        .group_by(PipelineStage.id, PipelineStage.name, PipelineStage.sort_order)
        .order_by(PipelineStage.sort_order)
    ).all()

    stage_distribution = [
        NamedCount(name=r.name, count=r.cnt or 0) for r in stage_rows
    ]

    # ── Top institutions ───────────────────────────────────────────────────────
    institution_rows = session.execute(
        select(
            ParsedResume.top_institution,
            func.count().label("cnt"),
        )
        .join(Applicant, Applicant.id == ParsedResume.applicant_id)
        .where(
            Applicant.job_id == job_id,
            ParsedResume.top_institution.is_not(None),
        )
        .group_by(ParsedResume.top_institution)
        .order_by(func.count().desc())
        .limit(8)
    ).all()

    top_institutions = [
        NamedCount(name=r.top_institution, count=r.cnt)
        for r in institution_rows
        if r.top_institution
    ]

    # ── Degree distribution ────────────────────────────────────────────────────
    degree_rows = session.execute(
        select(
            ParsedResume.top_degree,
            func.count().label("cnt"),
        )
        .join(Applicant, Applicant.id == ParsedResume.applicant_id)
        .where(
            Applicant.job_id == job_id,
            ParsedResume.top_degree.is_not(None),
        )
        .group_by(ParsedResume.top_degree)
        .order_by(func.count().desc())
        .limit(8)
    ).all()

    degree_distribution = [
        NamedCount(name=r.top_degree, count=r.cnt)
        for r in degree_rows
        if r.top_degree
    ]

    # ── Parse status breakdown ─────────────────────────────────────────────────
    status_rows = session.execute(
        select(
            Applicant.parse_status,
            func.count().label("cnt"),
        )
        .where(Applicant.job_id == job_id)
        .group_by(Applicant.parse_status)
    ).all()

    # Use friendly labels and fixed order
    status_label = {
        ParseStatus.parsed: "Parsed",
        ParseStatus.pending: "Pending",
        ParseStatus.parsing: "In progress",
        ParseStatus.failed: "Failed",
        ParseStatus.needs_manual: "Needs review",
    }
    parse_status_distribution = [
        NamedCount(name=status_label.get(r.parse_status, r.parse_status), count=r.cnt)
        for r in status_rows
    ]

    return AnalyticsOut(
        total_applicants=total,
        volume_days=num_days,
        volume_range_start=rs_str,
        volume_range_end=re_str,
        volume_by_day=volume_by_day,
        stage_distribution=stage_distribution,
        top_institutions=top_institutions,
        degree_distribution=degree_distribution,
        parse_status_distribution=parse_status_distribution,
    )
