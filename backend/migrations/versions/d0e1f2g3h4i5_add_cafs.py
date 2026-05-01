"""add_cafs

Revision ID: d0e1f2g3h4i5
Revises: b8c9d0e1f2a3
Create Date: 2026-05-01 20:00:00.000000

Creates cafs table to store CAF (Authorization Folio) records from SII.
- CAFs store folio ranges for authorized DTE types
- Each CAF belongs to one empresa
- Tracks usage (consumido) and validity status
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'd0e1f2g3h4i5'
down_revision: Union[str, Sequence[str], None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cafs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresas.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tipo_dte', sa.String(length=2), nullable=False),
        sa.Column('num_inicio', sa.Integer(), nullable=False),
        sa.Column('num_fin', sa.Integer(), nullable=False),
        sa.Column('archivo_xml', sa.Text(), nullable=False),
        sa.Column('vigente', sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column('consumido', sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column('fecha_carga', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint('empresa_id', 'tipo_dte', 'num_inicio', name='uq_cafs_empresa_tipo_inicio'),
        sa.CheckConstraint('num_fin > num_inicio', name='ck_cafs_num_fin_gt_num_inicio'),
    )

    # Create indexes for efficient querying
    op.create_index('ix_cafs_empresa_id', 'cafs', ['empresa_id'])
    op.create_index('ix_cafs_tipo_dte', 'cafs', ['tipo_dte'])
    op.create_index('ix_cafs_empresa_tipo_dte', 'cafs', ['empresa_id', 'tipo_dte'])


def downgrade() -> None:
    op.drop_index('ix_cafs_empresa_tipo_dte', 'cafs')
    op.drop_index('ix_cafs_tipo_dte', 'cafs')
    op.drop_index('ix_cafs_empresa_id', 'cafs')
    op.drop_table('cafs')
