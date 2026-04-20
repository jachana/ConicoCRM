"""add aprobaciones_credito table

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "l2m3n4o5p6q7"
down_revision: Union[str, None] = "k1l2m3n4o5p6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aprobaciones_credito",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("vendedor_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("empresa_id", sa.Integer, sa.ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("nota", sa.Text, nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("origen", sa.String(20), nullable=False),
        sa.Column("cotizacion_id", sa.Integer, sa.ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nv_payload", sa.Text, nullable=True),
        sa.Column("nv_id", sa.Integer, sa.ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("aprobaciones_credito")
