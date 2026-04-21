"""add_dte_emision

Revision ID: 89d2661d7423
Revises: 194162efd82b
Create Date: 2026-04-21 14:30:02.955815

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '89d2661d7423'
down_revision: Union[str, Sequence[str], None] = '194162efd82b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dte_emisiones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(3), nullable=False),
        sa.Column("folio", sa.Integer(), nullable=True),
        sa.Column("track_id", sa.String(100), nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("factura_id", sa.Integer(), nullable=True),
        sa.Column("nota_credito_id", sa.Integer(), nullable=True),
        sa.Column("nota_debito_id", sa.Integer(), nullable=True),
        sa.Column("monto_neto", sa.Integer(), nullable=False),
        sa.Column("monto_iva", sa.Integer(), nullable=False),
        sa.Column("monto_total", sa.Integer(), nullable=False),
        sa.Column("respuesta_sii", sa.JSON(), nullable=True),
        sa.Column("intentos_poll", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("emitido_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("aceptado_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["factura_id"], ["facturas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dte_emisiones_track_id", "dte_emisiones", ["track_id"])


def downgrade() -> None:
    op.drop_index("ix_dte_emisiones_track_id", table_name="dte_emisiones")
    op.drop_table("dte_emisiones")
