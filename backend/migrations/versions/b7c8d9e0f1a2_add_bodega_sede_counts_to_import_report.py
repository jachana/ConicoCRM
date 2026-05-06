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
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    # Guard: table may not exist yet (created later by c9d0e1f2g3h4 with these cols included)
    if 'payment_import_reports' not in inspector.get_table_names():
        return
    existing = {c['name'] for c in inspector.get_columns('payment_import_reports')}
    new_cols = [
        ('created_bodega_count', sa.Integer()),
        ('updated_bodega_count', sa.Integer()),
        ('created_sede_count', sa.Integer()),
        ('updated_sede_count', sa.Integer()),
    ]
    for col_name, col_type in new_cols:
        if col_name not in existing:
            op.add_column(
                'payment_import_reports',
                sa.Column(col_name, col_type, nullable=False, server_default='0'),
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'payment_import_reports' not in inspector.get_table_names():
        return
    existing = {c['name'] for c in inspector.get_columns('payment_import_reports')}
    for col_name in ('updated_sede_count', 'created_sede_count', 'updated_bodega_count', 'created_bodega_count'):
        if col_name in existing:
            op.drop_column('payment_import_reports', col_name)
