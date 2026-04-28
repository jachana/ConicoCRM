"""drop prioridad empresa

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-04-27

"""
from alembic import op
import sqlalchemy as sa

revision = 'e3f4a5b6c7d8'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("empresas", "prioridad")


def downgrade() -> None:
    op.add_column("empresas", sa.Column("prioridad", sa.String(50), nullable=True))
