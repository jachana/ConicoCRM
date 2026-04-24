"""add_marca_volumen_costo_fields_and_movimiento_lote_fk

Revision ID: 2f41ac6f7a5d
Revises: 3a52bd7e8f91
Create Date: 2026-04-23 17:36:20.994586

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f41ac6f7a5d'
down_revision: Union[str, Sequence[str], None] = '3a52bd7e8f91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('movimientos_inventario', sa.Column('lote_costo_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_movimientos_inventario_lote_costo_id', 'movimientos_inventario', 'lotes_costo', ['lote_costo_id'], ['id'], ondelete='SET NULL')
    op.add_column('productos', sa.Column('marca_id', sa.Integer(), nullable=True))
    op.add_column('productos', sa.Column('volumen', sa.Numeric(precision=8, scale=2), nullable=True))
    op.add_column('productos', sa.Column('ultimo_costo_unitario', sa.Numeric(precision=12, scale=2), server_default=sa.text('0'), nullable=False))
    op.create_foreign_key('fk_productos_marca_id', 'productos', 'marcas', ['marca_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_lotes_costo_producto_created', 'lotes_costo', ['producto_id', 'created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_lotes_costo_producto_created', table_name='lotes_costo')
    op.drop_constraint('fk_productos_marca_id', 'productos', type_='foreignkey')
    op.drop_column('productos', 'ultimo_costo_unitario')
    op.drop_column('productos', 'volumen')
    op.drop_column('productos', 'marca_id')
    op.drop_constraint('fk_movimientos_inventario_lote_costo_id', 'movimientos_inventario', type_='foreignkey')
    op.drop_column('movimientos_inventario', 'lote_costo_id')
