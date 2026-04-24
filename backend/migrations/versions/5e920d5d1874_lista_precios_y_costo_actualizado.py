"""lista_precios_y_costo_actualizado

Revision ID: 5e920d5d1874
Revises: 2f41ac6f7a5d
Create Date: 2026-04-23 22:40:35.144861

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5e920d5d1874'
down_revision: Union[str, Sequence[str], None] = '2f41ac6f7a5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "listas_precios",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("nombre_archivo", sa.String(255), nullable=False),
        sa.Column("ruta_archivo", sa.String(500), nullable=False),
        sa.Column("subida_por_id", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("fecha_subida", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("activa", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("total_items", sa.Integer, server_default=sa.text("0"), nullable=False),
    )
    op.create_index("ix_listas_precios_activa", "listas_precios", ["activa"])

    op.create_table(
        "lista_precios_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("lista_id", sa.Integer, sa.ForeignKey("listas_precios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sku", sa.String(100), nullable=False),
        sa.Column("costo_unitario", sa.Numeric(12, 2), nullable=False),
    )
    op.create_index("ix_lista_precios_items_sku", "lista_precios_items", ["sku"])
    op.create_index("ix_lista_precios_items_lista_sku", "lista_precios_items", ["lista_id", "sku"])

    op.add_column(
        "productos",
        sa.Column("precio_costo_actualizado_en", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("productos", "precio_costo_actualizado_en")
    op.drop_index("ix_lista_precios_items_lista_sku", table_name="lista_precios_items")
    op.drop_index("ix_lista_precios_items_sku", table_name="lista_precios_items")
    op.drop_table("lista_precios_items")
    op.drop_index("ix_listas_precios_activa", table_name="listas_precios")
    op.drop_table("listas_precios")
