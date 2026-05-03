"""add_historico_gd

Revision ID: f6a7b8c9d0e1
Revises: 6e0dd2e43ea7
Create Date: 2026-05-02 12:00:00.000000

Onboarding GD: add historico boolean flag to guias_despacho table.
Used to distinguish historically imported GDs from newly issued ones.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = '6e0dd2e43ea7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'guias_despacho',
        sa.Column('historico', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('guias_despacho', 'historico')
