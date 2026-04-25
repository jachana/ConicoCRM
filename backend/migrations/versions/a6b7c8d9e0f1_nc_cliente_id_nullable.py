"""nc_cliente_id_nullable

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
Create Date: 2026-04-25 14:00:00.000000

W1-04 follow-up: anular boleta anónima genera NC sin cliente, así que
notas_credito.cliente_id pasa a ser NULLABLE.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a6b7c8d9e0f1'
down_revision: Union[str, Sequence[str], None] = 'z5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.alter_column('notas_credito', 'cliente_id', existing_type=sa.Integer(), nullable=True)
    else:
        # SQLite: requires batch_alter_table to change nullability.
        with op.batch_alter_table('notas_credito') as batch_op:
            batch_op.alter_column('cliente_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.alter_column('notas_credito', 'cliente_id', existing_type=sa.Integer(), nullable=False)
    else:
        with op.batch_alter_table('notas_credito') as batch_op:
            batch_op.alter_column('cliente_id', existing_type=sa.Integer(), nullable=False)
