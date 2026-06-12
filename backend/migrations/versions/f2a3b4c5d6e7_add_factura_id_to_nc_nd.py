"""add factura_id to notas_credito and notas_debito

Revision ID: f2a3b4c5d6e7
Revises: e6f7g8h9i0j1
Create Date: 2026-06-12 12:00:00.000000

NC/ND pueden rectificar una factura. Adds nullable FK -> facturas.id on
notas_credito and notas_debito. ON DELETE SET NULL so removing a factura
un-references rather than cascades.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, Sequence[str], None] = 'e6f7g8h9i0j1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notas_credito', sa.Column('factura_id', sa.Integer(), nullable=True))
    op.create_index('ix_notas_credito_factura_id', 'notas_credito', ['factura_id'])
    op.create_foreign_key(
        'fk_notas_credito_factura_id_facturas',
        'notas_credito', 'facturas',
        ['factura_id'], ['id'],
        ondelete='SET NULL',
    )

    op.add_column('notas_debito', sa.Column('factura_id', sa.Integer(), nullable=True))
    op.create_index('ix_notas_debito_factura_id', 'notas_debito', ['factura_id'])
    op.create_foreign_key(
        'fk_notas_debito_factura_id_facturas',
        'notas_debito', 'facturas',
        ['factura_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_notas_debito_factura_id_facturas', 'notas_debito', type_='foreignkey')
    op.drop_index('ix_notas_debito_factura_id', table_name='notas_debito')
    op.drop_column('notas_debito', 'factura_id')

    op.drop_constraint('fk_notas_credito_factura_id_facturas', 'notas_credito', type_='foreignkey')
    op.drop_index('ix_notas_credito_factura_id', table_name='notas_credito')
    op.drop_column('notas_credito', 'factura_id')
