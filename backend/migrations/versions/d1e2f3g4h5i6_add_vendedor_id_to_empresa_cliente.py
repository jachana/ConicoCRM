"""add vendedor_id to empresas and clientes

Revision ID: d1e2f3g4h5i6
Revises: a1b2c3d4e5f0
Create Date: 2026-05-06 12:00:00.000000

Vendor scoping: vendedor solo ve Empresas/Clientes asignados.
Adds nullable FK -> users.id on empresas and clientes.
ON DELETE SET NULL so removing a user un-assigns rather than cascades.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'd1e2f3g4h5i6'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('empresas', sa.Column('vendedor_id', sa.Integer(), nullable=True))
    op.create_index('ix_empresas_vendedor_id', 'empresas', ['vendedor_id'])
    op.create_foreign_key(
        'fk_empresas_vendedor_id_users',
        'empresas', 'users',
        ['vendedor_id'], ['id'],
        ondelete='SET NULL',
    )

    op.add_column('clientes', sa.Column('vendedor_id', sa.Integer(), nullable=True))
    op.create_index('ix_clientes_vendedor_id', 'clientes', ['vendedor_id'])
    op.create_foreign_key(
        'fk_clientes_vendedor_id_users',
        'clientes', 'users',
        ['vendedor_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_clientes_vendedor_id_users', 'clientes', type_='foreignkey')
    op.drop_index('ix_clientes_vendedor_id', table_name='clientes')
    op.drop_column('clientes', 'vendedor_id')

    op.drop_constraint('fk_empresas_vendedor_id_users', 'empresas', type_='foreignkey')
    op.drop_index('ix_empresas_vendedor_id', table_name='empresas')
    op.drop_column('empresas', 'vendedor_id')
