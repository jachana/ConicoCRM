"""add_telemetry_rollup_tables

Revision ID: bf8739ac9261
Revises: z5a6b7c8d9e0
Create Date: 2026-05-05 10:00:00.000000

T2.1: tablas perf_rollup + cost_rollup para rollups horarios de latencia
y costo por empresa.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'bf8739ac9261'
down_revision: Union[str, Sequence[str], None] = ('z5a6b7c8d9e0', 'k3l4m5n6o7p8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # perf_rollup
    # ------------------------------------------------------------------
    op.create_table(
        'perf_rollup',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('hour', sa.DateTime(timezone=True), nullable=False),
        sa.Column('route', sa.String(length=500), nullable=False),
        sa.Column('empresa_id', sa.Integer(), nullable=True),
        sa.Column('count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('p50_ms', sa.Float(), nullable=False, server_default='0'),
        sa.Column('p95_ms', sa.Float(), nullable=False, server_default='0'),
        sa.Column('p99_ms', sa.Float(), nullable=False, server_default='0'),
        sa.Column('errors', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_queries', sa.BigInteger(), nullable=False, server_default='0'),
    )
    op.create_index('ix_perf_rollup_hour_route', 'perf_rollup', ['hour', 'route'])

    # ------------------------------------------------------------------
    # cost_rollup
    # ------------------------------------------------------------------
    op.create_table(
        'cost_rollup',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('hour', sa.DateTime(timezone=True), nullable=False),
        sa.Column('empresa_id', sa.Integer(), nullable=True),
        sa.Column('total_cost_clp', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('count', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_cost_rollup_hour_empresa', 'cost_rollup', ['hour', 'empresa_id'])


def downgrade() -> None:
    op.drop_index('ix_cost_rollup_hour_empresa', table_name='cost_rollup')
    op.drop_table('cost_rollup')

    op.drop_index('ix_perf_rollup_hour_route', table_name='perf_rollup')
    op.drop_table('perf_rollup')
