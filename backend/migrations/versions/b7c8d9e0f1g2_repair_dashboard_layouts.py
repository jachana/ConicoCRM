"""repair dashboard_layouts table (idempotent)

Some prod databases skipped over revisions h8i9j0k1l2m3 + i9j0k1l2m3n4
(e.g. via alembic stamp or a restore from a snapshot taken before those
migrations were created), leaving alembic_version past them while the
dashboard_layouts table does not exist. This migration creates the
table with the post-multi-preset schema only if it is missing, so it
is a no-op for environments that already have it.

Revision ID: b7c8d9e0f1g2
Revises: a6b7c8d9e0f1
Create Date: 2026-04-25 23:55:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "b7c8d9e0f1g2"
down_revision: Union[str, None] = "a6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "dashboard_layouts" in insp.get_table_names():
        return

    op.create_table(
        "dashboard_layouts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("name", sa.String(50), nullable=False, server_default="Principal"),
        sa.Column("layout_json", sa.Text(), nullable=False, server_default="'{}'"),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("role", "slot", name="uq_dashboard_role_slot"),
    )


def downgrade() -> None:
    pass
