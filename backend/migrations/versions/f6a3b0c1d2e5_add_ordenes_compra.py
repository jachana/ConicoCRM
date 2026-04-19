"""add ordenes_compra tables

Revision ID: f6a3b0c1d2e5
Revises: f1a2b3c4d5e6
Create Date: 2026-04-18 20:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f6a3b0c1d2e5"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ordenes_compra",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("proveedor_id", sa.Integer(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("fecha_entrega_esperada", sa.Date(), nullable=True),
        sa.Column("estado", sa.String(30), nullable=False),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_iva", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["proveedor_id"], ["proveedores.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ordenes_compra_numero", "ordenes_compra", ["numero"], unique=True)

    op.create_table(
        "orden_compra_lineas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("orden_compra_id", sa.Integer(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("descripcion", sa.String(500), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("cantidad_recibida", sa.Integer(), nullable=False),
        sa.Column("valor_neto", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False),
        sa.Column("iva", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["orden_compra_id"], ["ordenes_compra.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("orden_compra_lineas")
    op.drop_index("ix_ordenes_compra_numero", table_name="ordenes_compra")
    op.drop_table("ordenes_compra")
