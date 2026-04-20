"""empresa credit fields, remove forma_pago from clientes

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-04-19 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "k1l2m3n4o5p6"
down_revision: Union[str, None] = "j0k1l2m3n4o5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("empresas", sa.Column("linea_credito", sa.Numeric(14, 2), nullable=True))
    op.add_column("empresas", sa.Column("limite_credito", sa.Numeric(14, 2), nullable=True))
    op.add_column("empresas", sa.Column("plazo_credito", sa.String(50), nullable=True))
    op.drop_column("clientes", "forma_pago")


def downgrade() -> None:
    op.drop_column("empresas", "linea_credito")
    op.drop_column("empresas", "limite_credito")
    op.drop_column("empresas", "plazo_credito")
    op.add_column("clientes", sa.Column("forma_pago", sa.String(100), nullable=True))
