"""add nota_ventas and nota_venta_lineas tables

Revision ID: f1a2b3c4d5e6
Revises: e6f3a0b4c9d2
Create Date: 2026-04-18 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e6f3a0b4c9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nota_ventas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("cotizacion_id", sa.Integer(), nullable=True),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=True),
        sa.Column("vendedor_id", sa.Integer(), nullable=True),
        sa.Column("contacto", sa.String(255), nullable=True),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("correo", sa.String(255), nullable=True),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["cotizacion_id"], ["cotizaciones.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["vendedor_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_nota_ventas_numero", "nota_ventas", ["numero"], unique=True)

    op.create_table(
        "nota_venta_lineas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nv_id", sa.Integer(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("producto_id", sa.Integer(), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("descripcion", sa.String(500), nullable=False),
        sa.Column("formato", sa.String(50), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("valor_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("margen", sa.Numeric(10, 8), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["nv_id"], ["nota_ventas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="SET NULL"),
    )


def downgrade() -> None:
    op.drop_table("nota_venta_lineas")
    op.drop_index("ix_nota_ventas_numero", table_name="nota_ventas")
    op.drop_table("nota_ventas")
