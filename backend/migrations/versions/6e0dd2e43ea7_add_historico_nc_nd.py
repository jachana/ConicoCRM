"""add_historico_nc_nd

Revision ID: 6e0dd2e43ea7
Revises: z5a6b7c8d9e0
Create Date: 2026-05-02 10:00:00.000000

Onboarding NC/ND: add historico boolean flag to notas_credito and notas_debito tables.
Used to distinguish historically imported documents from newly issued ones.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '6e0dd2e43ea7'
down_revision: Union[str, Sequence[str], None] = 'z5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # notas_credito: add historico column
    # ------------------------------------------------------------------
    if bind.dialect.name == 'postgresql':
        op.add_column(
            'notas_credito',
            sa.Column('historico', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        )
    else:
        with op.batch_alter_table('notas_credito') as batch_op:
            batch_op.add_column(
                sa.Column('historico', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            )

    # ------------------------------------------------------------------
    # notas_debito: add historico column
    # ------------------------------------------------------------------
    if bind.dialect.name == 'postgresql':
        op.add_column(
            'notas_debito',
            sa.Column('historico', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        )
    else:
        with op.batch_alter_table('notas_debito') as batch_op:
            batch_op.add_column(
                sa.Column('historico', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            )


def downgrade() -> None:
    bind = op.get_bind()

    # notas_debito: remove historico
    if bind.dialect.name == 'postgresql':
        op.drop_column('notas_debito', 'historico')
    else:
        with op.batch_alter_table('notas_debito') as batch_op:
            batch_op.drop_column('historico')

    # notas_credito: remove historico
    if bind.dialect.name == 'postgresql':
        op.drop_column('notas_credito', 'historico')
    else:
        with op.batch_alter_table('notas_credito') as batch_op:
            batch_op.drop_column('historico')
