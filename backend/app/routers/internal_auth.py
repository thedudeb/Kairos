"""Server-to-server endpoint called by Auth.js after a successful sign-in.

Handles env-var bootstrap (`INITIAL_ADMIN_EMAIL`), pending `UserInvite` rows,
and first-user demo access.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.config import settings
from app.db import get_session
from app.models._base import Role
from app.models.user import User
from app.models.user_invite import UserInvite
from app.schemas.auth import UserOut, UserSyncRequest, UserSyncResponse
from app.security import issue_session_token, require_internal_api_key

router = APIRouter(
    prefix="/internal/auth",
    tags=["internal:auth"],
    dependencies=[Depends(require_internal_api_key)],
)


@router.post("/sync", response_model=UserSyncResponse)
def sync_user(
    payload: UserSyncRequest,
    session: Session = Depends(get_session),
) -> UserSyncResponse:
    user = session.exec(select(User).where(User.email == payload.email)).first()

    if user is None:
        em = payload.email.lower().strip()
        invite = session.exec(
            select(UserInvite).where(func.lower(UserInvite.email) == em)
        ).first()
        if invite:
            role = invite.role
            session.delete(invite)
            session.flush()
        else:
            is_first_user = session.exec(select(func.count()).select_from(User)).one() == 0
            is_bootstrap_admin = em == settings.initial_admin_email.lower()
            # Demo login is disabled in production — it would grant admin access
            # to anyone who clicks "Demo". Only allow in non-production environments.
            is_demo = em == "demo@kairos.app" and settings.environment != "production"
            role = Role.admin if (is_bootstrap_admin or is_first_user or is_demo) else Role.reviewer

        user = User(
            email=payload.email,
            name=payload.name,
            image_url=payload.image_url,
            role=role,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    else:
        dirty = False
        if payload.name and payload.name != user.name:
            user.name = payload.name
            dirty = True
        if payload.image_url and payload.image_url != user.image_url:
            user.image_url = payload.image_url
            dirty = True
        if dirty:
            session.add(user)
            session.commit()
            session.refresh(user)

    token = issue_session_token(user_id=user.id, email=user.email, role=user.role.value)
    return UserSyncResponse(
        user=UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            image_url=user.image_url,
            role=user.role,
        ),
        session_token=token,
    )
