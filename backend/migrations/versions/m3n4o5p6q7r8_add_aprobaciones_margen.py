"""add aprobaciones_margen table

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "m3n4o5p6q7r8"
down_revision: Union[str, None] = "l2m3n4o5p6q7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aprobaciones_margen",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("cotizacion_id", sa.Integer,
                  sa.ForeignKey("cotizaciones.id", ondelete="CASCADE"), nullable=True),
        sa.Column("vendedor_id", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nota", sa.Text, nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("lineas_propuestas", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("aprobaciones_margen")
