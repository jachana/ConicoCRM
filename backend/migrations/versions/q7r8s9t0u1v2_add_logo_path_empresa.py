"""add logo_path to empresa

Revision ID: q7r8s9t0u1v2
Revises: z5a6b7c8d9e0
Create Date: 2026-04-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'q7r8s9t0u1v2'
down_revision = 'z5a6b7c8d9e0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('empresas', sa.Column('logo_path', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('empresas', 'logo_path')
