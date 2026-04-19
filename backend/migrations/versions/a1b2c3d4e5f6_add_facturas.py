"""add facturas

Revision ID: a1b2c3d4e5f6
Revises: f6a3b0c1d2e5
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "f6a3b0c1d2e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "facturas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("cotizacion_id", sa.Integer(), sa.ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nv_id", sa.Integer(), sa.ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cliente_id", sa.Integer(), sa.ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vendedor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contacto", sa.String(255), nullable=True),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("fecha_vencimiento", sa.Date(), nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="emitida"),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("correo", sa.String(255), nullable=True),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("fecha_pago", sa.Date(), nullable=True),
        sa.Column("monto_pagado", sa.Numeric(12, 2), nullable=True),
        sa.Column("metodo_pago", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    op.create_index("ix_facturas_numero", "facturas", ["numero"], unique=True)

    op.create_table(
        "factura_lineas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factura_id", sa.Integer(), sa.ForeignKey("facturas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("producto_id", sa.Integer(), sa.ForeignKey("productos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("descripcion", sa.String(500), nullable=False),
        sa.Column("formato", sa.String(50), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("valor_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("margen", sa.Numeric(10, 8), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("factura_lineas")
    op.drop_index("ix_facturas_numero", "facturas")
    op.drop_table("facturas")
