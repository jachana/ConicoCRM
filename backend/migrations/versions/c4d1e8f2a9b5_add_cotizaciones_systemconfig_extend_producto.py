"""add cotizaciones, system_config, extend productos with sku and formato

Revision ID: c4d1e8f2a9b5
Revises: b2e9f4a1c7d3
Create Date: 2026-04-18 20:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c4d1e8f2a9b5"
down_revision: Union[str, None] = "b2e9f4a1c7d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend productos with sku and formato
    op.add_column("productos", sa.Column("sku", sa.String(100), nullable=True))
    op.add_column("productos", sa.Column("formato", sa.String(50), nullable=True))
    op.create_index("ix_productos_sku", "productos", ["sku"])

    # system_config key/value store
    op.create_table(
        "system_config",
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )

    # cotizaciones
    op.create_table(
        "cotizaciones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("cliente_id", sa.Integer(), nullable=False),
        sa.Column("vendedor_id", sa.Integer(), nullable=False),
        sa.Column("contacto", sa.String(255), nullable=True),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("estado", sa.String(20), nullable=False),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("correo", sa.String(255), nullable=True),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_iva", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vendedor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("numero"),
    )
    op.create_index("ix_cotizaciones_numero", "cotizaciones", ["numero"], unique=True)

    # cotizacion_lineas
    op.create_table(
        "cotizacion_lineas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cotizacion_id", sa.Integer(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("descripcion", sa.String(500), nullable=False),
        sa.Column("formato", sa.String(50), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("valor_neto", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False),
        sa.Column("iva", sa.Numeric(12, 2), nullable=False),
        sa.Column("total", sa.Numeric(12, 2), nullable=False),
        sa.Column("margen", sa.Numeric(10, 8), nullable=True),
        sa.ForeignKeyConstraint(["cotizacion_id"], ["cotizaciones.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("cotizacion_lineas")
    op.drop_index("ix_cotizaciones_numero", table_name="cotizaciones")
    op.drop_table("cotizaciones")
    op.drop_table("system_config")
    op.drop_index("ix_productos_sku", table_name="productos")
    op.drop_column("productos", "formato")
    op.drop_column("productos", "sku")
