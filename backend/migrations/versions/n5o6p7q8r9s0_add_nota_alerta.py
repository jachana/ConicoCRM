"""add_nota_alerta

Revision ID: n5o6p7q8r9s0
Revises: z5a6b7c8d9e0
Create Date: 2026-05-01 15:00:00.000000

Adds notas_alertas table for quotation (cotizacion) alerts tracking.
- id (pk)
- cotizacion_id (FK to cotizaciones, CASCADE delete)
- contenido (text)
- estado (enum: pendiente/completada/cancelada, default pendiente)
- created_at, updated_at (timestamps with timezone)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'n5o6p7q8r9s0'
down_revision: Union[str, Sequence[str], None] = 'z5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notas_alertas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cotizacion_id', sa.Integer(), nullable=False),
        sa.Column('contenido', sa.Text(), nullable=False),
        sa.Column('estado', sa.String(length=20), nullable=False, server_default=sa.text("'pendiente'")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(['cotizacion_id'], ['cotizaciones.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notas_alertas_cotizacion_id'), 'notas_alertas', ['cotizacion_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_notas_alertas_cotizacion_id'), table_name='notas_alertas')
    op.drop_table('notas_alertas')

