"""Add Libro and DteRecepcion models

Revision ID: i0j1k2l3m4n5
Revises: b18e782cc8db
Create Date: 2026-05-01 12:20:00.000000

Phase 1 DTE Libros feature: add tables for LibroVentas, LibroCompras, and DteRecepcion.

LibroVentas: sales register (one per company per month)
LibroCompras: purchase register (one per company per month)
DteRecepcion: incoming DTEs from suppliers
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "i0j1k2l3m4n5"
down_revision: Union[str, Sequence[str], None] = "b18e782cc8db"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # libros_ventas
    # ------------------------------------------------------------------
    op.create_table(
        "libros_ventas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("periodo", sa.String(length=7), nullable=False),  # YYYY-MM
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folio_inicio", sa.Integer(), nullable=True),
        sa.Column("folio_fin", sa.Integer(), nullable=True),
        sa.Column("total_registros", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("monto_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="borrador"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("empresa_id", "periodo", name="uq_libro_ventas_empresa_periodo"),
    )
    op.create_index("ix_libro_ventas_empresa_id", "libros_ventas", ["empresa_id"])
    op.create_index("ix_libro_ventas_estado", "libros_ventas", ["estado"])

    # ------------------------------------------------------------------
    # libros_compras
    # ------------------------------------------------------------------
    op.create_table(
        "libros_compras",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("periodo", sa.String(length=7), nullable=False),  # YYYY-MM
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rut_proveedor", sa.String(length=20), nullable=True),
        sa.Column("total_registros", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("monto_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="borrador"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("empresa_id", "periodo", name="uq_libro_compras_empresa_periodo"),
    )
    op.create_index("ix_libro_compras_empresa_id", "libros_compras", ["empresa_id"])
    op.create_index("ix_libro_compras_estado", "libros_compras", ["estado"])

    # ------------------------------------------------------------------
    # dte_recepciones
    # ------------------------------------------------------------------
    op.create_table(
        "dte_recepciones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(length=3), nullable=False),  # e.g. '46'
        sa.Column("folio", sa.Integer(), nullable=False),
        sa.Column("rut_emisor", sa.String(length=20), nullable=False),
        sa.Column("monto", sa.Integer(), nullable=False),
        sa.Column("xml_raw", sa.String(), nullable=True),  # Use String for large text
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="recibido"),
        sa.Column("respuesta_sii", sa.JSON(), nullable=True),
        sa.Column("rechazo_motivo", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_dte_recepciones_empresa_id", "dte_recepciones", ["empresa_id"])
    op.create_index("ix_dte_recepciones_estado", "dte_recepciones", ["estado"])
    op.create_index("ix_dte_recepciones_empresa_estado", "dte_recepciones", ["empresa_id", "estado"])


def downgrade() -> None:
    # dte_recepciones
    op.drop_index("ix_dte_recepciones_empresa_estado", table_name="dte_recepciones")
    op.drop_index("ix_dte_recepciones_estado", table_name="dte_recepciones")
    op.drop_index("ix_dte_recepciones_empresa_id", table_name="dte_recepciones")
    op.drop_table("dte_recepciones")

    # libros_compras
    op.drop_index("ix_libro_compras_estado", table_name="libros_compras")
    op.drop_index("ix_libro_compras_empresa_id", table_name="libros_compras")
    op.drop_table("libros_compras")

    # libros_ventas
    op.drop_index("ix_libro_ventas_estado", table_name="libros_ventas")
    op.drop_index("ix_libro_ventas_empresa_id", table_name="libros_ventas")
    op.drop_table("libros_ventas")
