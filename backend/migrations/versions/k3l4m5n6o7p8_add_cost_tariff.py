"""add_cost_tariff

Revision ID: k3l4m5n6o7p8
Revises: j4k5l6m7n8o9
Create Date: 2026-05-05 16:00:00.000000

T1.3: tabla cost_tariff para lookup de costo por tipo DTE en instrumentacion Lioren.
Seed con tarifas iniciales (costo_clp=0); actualizar via docs/operations/lioren_cost_maintenance.md.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'k3l4m5n6o7p8'
down_revision: Union[str, Sequence[str], None] = 'j4k5l6m7n8o9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INITIAL_TARIFFS = [
    ("factura_emision", "Factura Electrónica DTE 033", 0),
    ("factura_exenta", "Factura Exenta DTE 034", 0),
    ("nota_credito", "Nota de Crédito DTE 061", 0),
    ("nota_debito", "Nota de Débito DTE 056", 0),
    ("guia_despacho", "Guía de Despacho DTE 052", 0),
    ("boleta", "Boleta Electrónica DTE 039/041", 0),
    ("boleta_exenta", "Boleta Exenta DTE 041", 0),
    ("factura_compra", "Factura de Compra DTE 046", 0),
    ("libro_envio", "Envío Libro de Ventas/Compras", 0),
]


def upgrade() -> None:
    op.create_table(
        "cost_tariff",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(50), nullable=False, unique=True),
        sa.Column("descripcion", sa.String(200), nullable=False),
        sa.Column("costo_clp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_cost_tariff_slug", "cost_tariff", ["slug"], unique=True)

    tariff_table = sa.table(
        "cost_tariff",
        sa.column("slug", sa.String),
        sa.column("descripcion", sa.String),
        sa.column("costo_clp", sa.Integer),
    )
    op.bulk_insert(
        tariff_table,
        [{"slug": slug, "descripcion": desc, "costo_clp": cost} for slug, desc, cost in _INITIAL_TARIFFS],
    )


def downgrade() -> None:
    op.drop_index("ix_cost_tariff_slug", table_name="cost_tariff")
    op.drop_table("cost_tariff")
