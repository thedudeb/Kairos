"""add stage_entered_at to applicants

Revision ID: a1b2c3d4e5f6
Revises: e67ca1c9c30d
Create Date: 2026-04-29 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'e67ca1c9c30d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'applicants',
        sa.Column(
            'stage_entered_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('applicants', 'stage_entered_at')
