"""drop_fifo_schema

Revision ID: b56c995d5d72
Revises: f2e9a8b7c6d5
Create Date: 2026-04-24 08:47:01.979198

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b56c995d5d72'
down_revision: Union[str, Sequence[str], None] = 'f2e9a8b7c6d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("movimientos_inventario") as batch:
        batch.drop_column("lote_costo_id")
    op.drop_table("lotes_costo")
    with op.batch_alter_table("productos") as batch:
        batch.drop_column("ultimo_costo_unitario")


def downgrade() -> None:
    with op.batch_alter_table("productos") as batch:
        batch.add_column(sa.Column("ultimo_costo_unitario", sa.Numeric(12, 2), server_default=sa.text("0"), nullable=False))
    op.create_table(
        "lotes_costo",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("producto_id", sa.Integer, sa.ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("oc_linea_id", sa.Integer, sa.ForeignKey("orden_compra_lineas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("costo_unitario", sa.Numeric(12, 2), nullable=False),
        sa.Column("cantidad_inicial", sa.Integer, nullable=False),
        sa.Column("cantidad_restante", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False, index=True),
    )
    with op.batch_alter_table("movimientos_inventario") as batch:
        batch.add_column(sa.Column("lote_costo_id", sa.Integer, sa.ForeignKey("lotes_costo.id", ondelete="SET NULL"), nullable=True))
