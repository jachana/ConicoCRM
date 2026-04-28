"""add rut_no_oficial to empresa

Revision ID: g1h2i3j4k5l6
Revises: f0a1b2c3d4e5
Create Date: 2026-04-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'g1h2i3j4k5l6'
down_revision = 'f0a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("empresas", sa.Column("rut_no_oficial", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("empresas", "rut_no_oficial")
