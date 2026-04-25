"""add_users_preferencias

Revision ID: x3y4z5a6b7c8
Revises: w2x3y4z5a6b7
Create Date: 2026-04-24 22:00:00.000000

Adds JSON column users.preferencias for per-user UI preferences.
Uses generic JSON (Postgres → JSONB, SQLite → TEXT) for cross-env portability.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'x3y4z5a6b7c8'
down_revision: Union[str, Sequence[str], None] = 'w2x3y4z5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column(
            'preferencias',
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'preferencias')
