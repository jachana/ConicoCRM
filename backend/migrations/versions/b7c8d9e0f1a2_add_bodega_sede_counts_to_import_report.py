"""add_bodega_sede_counts_to_import_report

Revision ID: b7c8d9e0f1a2
Revises: z5a6b7c8d9e0
Create Date: 2026-05-01 12:00:00.000000

Adds bodega/sede-specific count columns to payment_import_reports table
to track created/updated bodegas and sedes independently.
Fixes counting logic bug where bodega and sede counts were tangled together.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'z5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add bodega/sede-specific counts
    op.add_column(
        'payment_import_reports',
        sa.Column('created_bodega_count', sa.Integer(), nullable=False, server_default='0')
    )
    op.add_column(
        'payment_import_reports',
        sa.Column('updated_bodega_count', sa.Integer(), nullable=False, server_default='0')
    )
    op.add_column(
        'payment_import_reports',
        sa.Column('created_sede_count', sa.Integer(), nullable=False, server_default='0')
    )
    op.add_column(
        'payment_import_reports',
        sa.Column('updated_sede_count', sa.Integer(), nullable=False, server_default='0')
    )


def downgrade() -> None:
    # Remove bodega/sede-specific counts
    op.drop_column('payment_import_reports', 'updated_sede_count')
    op.drop_column('payment_import_reports', 'created_sede_count')
    op.drop_column('payment_import_reports', 'updated_bodega_count')
    op.drop_column('payment_import_reports', 'created_bodega_count')
