"""add_audit_log_archive

Revision ID: a1b2c3d4e5f0
Revises: bf8739ac9261
Create Date: 2026-05-06 10:00:00.000000

Ops: archive table for audit_log rows past the retention window (180 days
default). Rows are moved weekly by the audit_retention Celery task.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a1b2c3d4e5f0'
down_revision: Union[str, Sequence[str], None] = 'bf8739ac9261'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'audit_log_archive',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=20), nullable=False),
        sa.Column('entity_type', sa.String(length=80), nullable=False),
        sa.Column('entity_id', sa.String(length=80), nullable=False),
        sa.Column('diff_json', sa.JSON(), nullable=True),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=500), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index('ix_audit_log_archive_created_at', 'audit_log_archive', ['created_at'])
    op.create_index('ix_audit_log_archive_entity', 'audit_log_archive', ['entity_type', 'entity_id'])
    op.create_index('ix_audit_log_archive_action', 'audit_log_archive', ['action'])
    op.create_index('ix_audit_log_archive_entity_type', 'audit_log_archive', ['entity_type'])
    op.create_index('ix_audit_log_archive_user_id', 'audit_log_archive', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_audit_log_archive_user_id', table_name='audit_log_archive')
    op.drop_index('ix_audit_log_archive_entity_type', table_name='audit_log_archive')
    op.drop_index('ix_audit_log_archive_action', table_name='audit_log_archive')
    op.drop_index('ix_audit_log_archive_entity', table_name='audit_log_archive')
    op.drop_index('ix_audit_log_archive_created_at', table_name='audit_log_archive')
    op.drop_table('audit_log_archive')
