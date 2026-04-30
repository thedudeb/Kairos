"""CSV export for applicant data."""
from __future__ import annotations

import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.db import get_session
from app.models.applicant import Applicant, ParsedResume
from app.models.pipeline import PipelineStage
from app.security import require_admin

router = APIRouter(prefix="/jobs/{job_id}/export", tags=["export"])

_FORMULA_CHARS = ("=", "+", "-", "@", "\t", "\r")


def _csv(v: str | None) -> str:
    """Sanitise a cell value to prevent spreadsheet formula injection."""
    if not v:
        return ""
    if v[0] in _FORMULA_CHARS:
        return "'" + v  # prefix with single-quote — Excel/Calc treats as literal text
    return v


@router.get("/applicants.csv")
def export_applicants_csv(
    job_id: UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin),
) -> StreamingResponse:
    applicants = session.exec(
        select(Applicant)
        .where(Applicant.job_id == job_id)
        .order_by(Applicant.submitted_at.desc())
    ).all()

    stage_map: dict[UUID, str] = {}
    for s in session.exec(select(PipelineStage).where(PipelineStage.job_id == job_id)).all():
        stage_map[s.id] = s.name

    parsed_map: dict[UUID, ParsedResume] = {}
    for pr in session.exec(
        select(ParsedResume).where(
            ParsedResume.applicant_id.in_([a.id for a in applicants])
        )
    ).all():
        parsed_map[pr.applicant_id] = pr

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "First Name", "Last Name", "Email", "Phone",
        "Stage", "Parse Status", "Submitted At",
        "Institution", "Degree", "Parsed Name", "Parsed Email",
    ])

    for a in applicants:
        pr = parsed_map.get(a.id)
        writer.writerow([
            _csv(a.first_name),
            _csv(a.last_name),
            _csv(a.email),
            _csv(a.phone),
            _csv(stage_map.get(a.current_stage_id, "")),
            a.parse_status,
            a.submitted_at.strftime("%Y-%m-%d %H:%M UTC"),
            _csv(pr.top_institution if pr else ""),
            _csv(pr.top_degree if pr else ""),
            _csv(pr.full_name if pr else ""),
            _csv(pr.email if pr else ""),
        ])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="applicants-{job_id}.csv"'},
    )
