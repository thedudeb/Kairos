"""Admin-only staff directory and invitations."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.models._base import Role
from app.models.user import User
from app.models.user_invite import UserInvite
from app.schemas.users_admin import InviteCreate, InviteOut, StaffUserOut, UserRolePatch
from app.security import require_admin

router = APIRouter(prefix="/users", tags=["users"])


def _norm_email(email: str) -> str:
    return email.lower().strip()


@router.get("", response_model=list[StaffUserOut])
def list_users(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> list[StaffUserOut]:
    rows = session.exec(select(User).order_by(User.email)).all()
    return [StaffUserOut.model_validate(r) for r in rows]


@router.get("/invites/pending", response_model=list[InviteOut])
def list_pending_invites(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> list[InviteOut]:
    rows = session.exec(select(UserInvite).order_by(UserInvite.created_at.desc())).all()
    return [InviteOut.model_validate(r) for r in rows]


@router.post("/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
def create_invite(
    body: InviteCreate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> InviteOut:
    em = _norm_email(str(body.email))
    if session.exec(select(User).where(func.lower(User.email) == em)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists.")
    existing = session.exec(select(UserInvite).where(func.lower(UserInvite.email) == em)).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An invite for this email is already pending.")

    inv = UserInvite(email=em, role=body.role, invited_by_id=admin.id)
    session.add(inv)
    session.commit()
    session.refresh(inv)
    return InviteOut.model_validate(inv)


@router.delete("/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invite(
    invite_id: UUID,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> None:
    inv = session.get(UserInvite, invite_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "invite not found")
    session.delete(inv)
    session.commit()


@router.patch("/{user_id}/role", response_model=StaffUserOut)
def patch_user_role(
    user_id: UUID,
    body: UserRolePatch,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> StaffUserOut:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")

    if user.role == Role.admin and body.role == Role.reviewer:
        other_admins = session.execute(
            select(func.count()).select_from(User).where(User.role == Role.admin, User.id != user_id)
        ).scalar_one()
        if other_admins == 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Cannot demote the last admin.",
            )

    user.role = body.role
    session.add(user)
    session.commit()
    session.refresh(user)
    return StaffUserOut.model_validate(user)
