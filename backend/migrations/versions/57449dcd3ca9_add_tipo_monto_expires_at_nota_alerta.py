"""add_tipo_monto_expires_at_nota_alerta

Revision ID: 57449dcd3ca9
Revises: a6b7c8d9e0f1
Create Date: 2026-05-01 18:00:00.000000

Adds three new fields to notas_alertas table:
- tipo (String, default 'custom'): cobranza, crédito, custom
- monto (Numeric, nullable): amount if applicable
- expires_at (DateTime, nullable): expiration date for note validity
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '57449dcd3ca9'
down_revision: Union[str, Sequence[str], None] = 'a6b7c8d9e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'notas_alertas',
        sa.Column('tipo', sa.String(length=20), nullable=False, server_default=sa.text("'custom'"))
    )
    op.add_column(
        'notas_alertas',
        sa.Column('monto', sa.Numeric(precision=10, scale=2), nullable=True)
    )
    op.add_column(
        'notas_alertas',
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('notas_alertas', 'expires_at')
    op.drop_column('notas_alertas', 'monto')
    op.drop_column('notas_alertas', 'tipo')
