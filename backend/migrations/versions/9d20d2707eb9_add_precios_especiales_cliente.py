"""add_precios_especiales_cliente

Revision ID: 9d20d2707eb9
Revises: 7432c1eb1576, k2l3m4n5o6p7
Create Date: 2026-05-02 00:00:00.000000

Merges open heads and adds precios_especiales_cliente table for
customer/empresa-specific pricing imported during onboarding.
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = '9d20d2707eb9'
down_revision: Union[str, Sequence[str]] = ('7432c1eb1576', 'k2l3m4n5o6p7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'precios_especiales_cliente',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('rut_entidad', sa.String(20), nullable=False),
        sa.Column('sku', sa.String(100), nullable=False),
        sa.Column('precio_especial', sa.Numeric(12, 2), nullable=True),
        sa.Column('descuento_pct', sa.Numeric(5, 2), nullable=True),
        sa.Column('vigencia_desde', sa.Date(), nullable=True),
        sa.Column('vigencia_hasta', sa.Date(), nullable=True),
        sa.Column('cliente_id', sa.Integer(), nullable=True),
        sa.Column('empresa_id', sa.Integer(), nullable=True),
        sa.Column('producto_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['cliente_id'], ['clientes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['producto_id'], ['productos.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('rut_entidad', 'sku', name='uq_precio_especial_rut_sku'),
    )
    op.create_index('ix_precios_especiales_cliente_rut_entidad', 'precios_especiales_cliente', ['rut_entidad'])
    op.create_index('ix_precios_especiales_cliente_sku', 'precios_especiales_cliente', ['sku'])


def downgrade() -> None:
    op.drop_index('ix_precios_especiales_cliente_sku', table_name='precios_especiales_cliente')
    op.drop_index('ix_precios_especiales_cliente_rut_entidad', table_name='precios_especiales_cliente')
    op.drop_table('precios_especiales_cliente')
