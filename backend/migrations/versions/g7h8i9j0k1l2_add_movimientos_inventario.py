"""add movimientos_inventario table

Revision ID: g7h8i9j0k1l2
Revises: a1b2c3d4e5f6
Create Date: 2026-04-19 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "g7h8i9j0k1l2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "movimientos_inventario",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("producto_id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("signo", sa.Integer(), nullable=False),
        sa.Column("referencia_tipo", sa.String(30), nullable=True),
        sa.Column("referencia_id", sa.Integer(), nullable=True),
        sa.Column("motivo", sa.String(30), nullable=True),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["usuario_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_movimientos_inventario_producto_id", "movimientos_inventario", ["producto_id"])
    op.create_index("ix_movimientos_inventario_created_at", "movimientos_inventario", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_movimientos_inventario_created_at", table_name="movimientos_inventario")
    op.drop_index("ix_movimientos_inventario_producto_id", table_name="movimientos_inventario")
    op.drop_table("movimientos_inventario")
