"""Admin-only user and invite management schemas."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models._base import Role


class StaffUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    name: str | None = None
    role: Role


class InviteCreate(BaseModel):
    email: EmailStr
    role: Role = Role.reviewer


class InviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    role: Role
    invited_by_id: UUID | None = None
    created_at: datetime


class UserRolePatch(BaseModel):
    role: Role = Field(description="New role for the user")
