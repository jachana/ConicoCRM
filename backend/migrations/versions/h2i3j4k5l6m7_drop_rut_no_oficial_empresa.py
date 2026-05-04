"""drop rut_no_oficial from empresa

Revision ID: h2i3j4k5l6m7
Revises: f6a7b8c9d0e1
Create Date: 2026-05-04

"""
from alembic import op
import sqlalchemy as sa

revision = 'h2i3j4k5l6m7'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("empresas", "rut_no_oficial")


def downgrade() -> None:
    op.add_column("empresas", sa.Column("rut_no_oficial", sa.Boolean(), server_default="false", nullable=False))
