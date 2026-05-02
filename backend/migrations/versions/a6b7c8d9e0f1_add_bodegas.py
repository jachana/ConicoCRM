"""add_bodegas

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
Create Date: 2026-05-01 00:00:00.000000

Adds Bodega (warehouse) model with minimal schema:
- id, empresa_id, nombre, direccion (nullable), created_at
- FK to empresas with CASCADE delete
- index on empresa_id for efficient lookups
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a6b7c8d9e0f1'
down_revision: Union[str, Sequence[str], None] = 'z5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'bodegas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=255), nullable=False),
        sa.Column('direccion', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_bodegas_empresa_id'), 'bodegas', ['empresa_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_bodegas_empresa_id'), table_name='bodegas')
    op.drop_table('bodegas')
