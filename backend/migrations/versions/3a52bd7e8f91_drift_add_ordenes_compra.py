"""drift: add ordenes_compra and orden_compra_lineas tables, wire lotes_costo FK

Revision ID: 3a52bd7e8f91
Revises: a829239d4f22
Create Date: 2026-04-23 17:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3a52bd7e8f91'
down_revision: Union[str, Sequence[str], None] = 'a829239d4f22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Only create tables if they don't exist (schema drift correction)
    if 'ordenes_compra' not in inspector.get_table_names():
        op.create_table('ordenes_compra',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('numero', sa.Integer(), nullable=False),
        sa.Column('proveedor_id', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('fecha_entrega_esperada', sa.Date(), nullable=True),
        sa.Column('estado', sa.String(length=30), nullable=False),
        sa.Column('nota', sa.Text(), nullable=True),
        sa.Column('total_neto', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('total_iva', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('total', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['proveedor_id'], ['proveedores.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_ordenes_compra_numero'), 'ordenes_compra', ['numero'], unique=True)

    if 'orden_compra_lineas' not in inspector.get_table_names():
        op.create_table('orden_compra_lineas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('orden_compra_id', sa.Integer(), nullable=False),
        sa.Column('orden', sa.Integer(), nullable=False),
        sa.Column('producto_id', sa.Integer(), nullable=True),
        sa.Column('sku', sa.String(length=100), nullable=True),
        sa.Column('descripcion', sa.String(length=500), nullable=False),
        sa.Column('cantidad', sa.Integer(), nullable=False),
        sa.Column('cantidad_recibida', sa.Integer(), nullable=False),
        sa.Column('valor_neto', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('total_neto', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('iva', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('total', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(['orden_compra_id'], ['ordenes_compra.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['producto_id'], ['productos.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
        )

    # Wire the deferred FK that lotes_costo already declared but couldn't resolve
    # Only create if it doesn't exist
    fks = [fk['name'] for fk in inspector.get_foreign_keys('lotes_costo')]
    if 'fk_lotes_costo_oc_linea_id' not in fks:
        op.create_foreign_key('fk_lotes_costo_oc_linea_id', 'lotes_costo', 'orden_compra_lineas', ['oc_linea_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_lotes_costo_oc_linea_id', 'lotes_costo', type_='foreignkey')
    op.drop_table('orden_compra_lineas')
    op.drop_index(op.f('ix_ordenes_compra_numero'), table_name='ordenes_compra')
    op.drop_table('ordenes_compra')
