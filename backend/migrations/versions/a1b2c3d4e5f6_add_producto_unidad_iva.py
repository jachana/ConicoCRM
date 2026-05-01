"""add_producto_unidad_iva

Revision ID: a1b2c3d4e5f6
Revises: z5a6b7c8d9e0
Create Date: 2026-05-01 12:00:00.000000

Add unidad (str, nullable) and iva_porcentaje (int, default 19) columns to productos table
for product import feature.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'z5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('productos', sa.Column('unidad', sa.String(length=50), nullable=True))
    op.add_column('productos', sa.Column('iva_porcentaje', sa.Integer(), nullable=False, server_default='19'))


def downgrade() -> None:
    op.drop_column('productos', 'iva_porcentaje')
    op.drop_column('productos', 'unidad')
