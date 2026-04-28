"""drop forma_pago from empresa

Revision ID: f0a1b2c3d4e5
Revises: e3f4a5b6c7d8
Create Date: 2026-04-28

"""
from alembic import op

revision = 'f0a1b2c3d4e5'
down_revision = 'e3f4a5b6c7d8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("empresas", "forma_pago")


def downgrade() -> None:
    import sqlalchemy as sa
    op.add_column("empresas", sa.Column("forma_pago", sa.String(100), nullable=True))
