"""user invites, job description modes, per-field file types

Revision ID: b8d4f2a1c3e5
Revises: a1b2c3d4e5f6
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b8d4f2a1c3e5"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

role_enum = postgresql.ENUM("admin", "reviewer", name="role", create_type=False)


def upgrade() -> None:
    op.create_table(
        "user_invites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("role", role_enum, nullable=False),
        sa.Column("invited_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["invited_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_invites_email"), "user_invites", ["email"], unique=True)

    op.add_column(
        "jobs",
        sa.Column(
            "description_kind",
            sa.String(length=32),
            server_default="markdown",
            nullable=False,
        ),
    )
    op.add_column("jobs", sa.Column("description_external_url", sa.String(length=2000), nullable=True))
    op.add_column("jobs", sa.Column("description_summary", sa.String(), nullable=True))

    op.add_column("job_form_fields", sa.Column("file_allowed_types", sa.JSON(), nullable=True))
    op.add_column("template_form_fields", sa.Column("file_allowed_types", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("template_form_fields", "file_allowed_types")
    op.drop_column("job_form_fields", "file_allowed_types")

    op.drop_column("jobs", "description_summary")
    op.drop_column("jobs", "description_external_url")
    op.drop_column("jobs", "description_kind")

    op.drop_index(op.f("ix_user_invites_email"), table_name="user_invites")
    op.drop_table("user_invites")
