"""add tipo_dte to facturas

Revision ID: e5dk4lof5h1c
Revises: z5a6b7c8d9e0
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "e5dk4lof5h1c"
down_revision = "z5a6b7c8d9e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "facturas",
        sa.Column("tipo_dte", sa.String(3), nullable=False, server_default="033"),
    )


def downgrade() -> None:
    op.drop_column("facturas", "tipo_dte")
