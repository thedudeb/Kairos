"""Returns the currently authenticated user — the canonical 'is auth working' probe."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.models.user import User
from app.schemas.auth import UserOut
from app.security import get_current_user

router = APIRouter(tags=["me"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        image_url=user.image_url,
        role=user.role,
    )
