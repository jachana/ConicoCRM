"""add terminos_pago and datos_bancarios to cotizaciones/config

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "n4o5p6q7r8s9"
down_revision: Union[str, None] = "m3n4o5p6q7r8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cotizaciones",
        sa.Column("terminos_pago", sa.String(255), nullable=True),
    )
    op.add_column(
        "cotizaciones",
        sa.Column(
            "terminos_pago_estado",
            sa.String(20),
            nullable=False,
            server_default="aprobado",
        ),
    )


def downgrade() -> None:
    op.drop_column("cotizaciones", "terminos_pago_estado")
    op.drop_column("cotizaciones", "terminos_pago")
