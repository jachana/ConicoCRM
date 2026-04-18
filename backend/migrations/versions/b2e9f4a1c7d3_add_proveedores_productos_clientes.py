"""add proveedores, productos y clientes tables

Revision ID: b2e9f4a1c7d3
Revises: a3f8c12e9d04
Create Date: 2026-04-17 20:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b2e9f4a1c7d3"
down_revision: Union[str, None] = "a3f8c12e9d04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "proveedores",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("rut", sa.String(20), nullable=True),
        sa.Column("contacto", sa.String(255), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("telefono", sa.String(50), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rut"),
    )
    op.create_index("ix_proveedores_rut", "proveedores", ["rut"], unique=True)

    op.create_table(
        "productos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("precio_costo", sa.Numeric(12, 2), nullable=False),
        sa.Column("precio_venta", sa.Numeric(12, 2), nullable=False),
        sa.Column("stock_minimo", sa.Integer(), nullable=False),
        sa.Column("stock_actual", sa.Integer(), nullable=False),
        sa.Column("proveedor_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["proveedor_id"], ["proveedores.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_productos_nombre", "productos", ["nombre"])

    op.create_table(
        "clientes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("rut", sa.String(20), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("telefono", sa.String(50), nullable=True),
        sa.Column("direccion", sa.String(500), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rut"),
    )
    op.create_index("ix_clientes_rut", "clientes", ["rut"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_clientes_rut", table_name="clientes")
    op.drop_table("clientes")
    op.drop_index("ix_productos_nombre", table_name="productos")
    op.drop_table("productos")
    op.drop_index("ix_proveedores_rut", table_name="proveedores")
    op.drop_table("proveedores")
