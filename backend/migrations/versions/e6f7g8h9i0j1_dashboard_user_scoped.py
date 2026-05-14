"""dashboard_layouts: per-user templates (vendedor self-service, max 5)

Revision ID: e6f7g8h9i0j1
Revises: d1e2f3g4h5i6
Create Date: 2026-05-14 09:00:00.000000

Adds nullable user_id to dashboard_layouts. When user_id IS NULL the row is
the role-shared layout (admin-managed). When user_id IS NOT NULL the row is
a personal template owned by that user (vendedor can manage their own,
capped at 5 per user in application code).

Replaces unique (role, slot) with two partial uniques so both kinds coexist
without colliding.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision: str = 'e6f7g8h9i0j1'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3g4h5i6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if 'dashboard_layouts' not in insp.get_table_names():
        return

    cols = {c['name'] for c in insp.get_columns('dashboard_layouts')}
    if 'user_id' not in cols:
        op.add_column(
            'dashboard_layouts',
            sa.Column('user_id', sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            'fk_dashboard_layouts_user_id_users',
            'dashboard_layouts', 'users',
            ['user_id'], ['id'],
            ondelete='CASCADE',
        )

    existing_uqs = {uq['name'] for uq in insp.get_unique_constraints('dashboard_layouts')}
    if 'uq_dashboard_role_slot' in existing_uqs:
        op.drop_constraint('uq_dashboard_role_slot', 'dashboard_layouts', type_='unique')

    existing_idx = {ix['name'] for ix in insp.get_indexes('dashboard_layouts')}
    if 'uq_dashboard_role_slot_shared' not in existing_idx:
        op.create_index(
            'uq_dashboard_role_slot_shared',
            'dashboard_layouts',
            ['role', 'slot'],
            unique=True,
            postgresql_where=sa.text('user_id IS NULL'),
            sqlite_where=sa.text('user_id IS NULL'),
        )
    if 'uq_dashboard_user_slot' not in existing_idx:
        op.create_index(
            'uq_dashboard_user_slot',
            'dashboard_layouts',
            ['user_id', 'slot'],
            unique=True,
            postgresql_where=sa.text('user_id IS NOT NULL'),
            sqlite_where=sa.text('user_id IS NOT NULL'),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if 'dashboard_layouts' not in insp.get_table_names():
        return

    existing_idx = {ix['name'] for ix in insp.get_indexes('dashboard_layouts')}
    if 'uq_dashboard_user_slot' in existing_idx:
        op.drop_index('uq_dashboard_user_slot', table_name='dashboard_layouts')
    if 'uq_dashboard_role_slot_shared' in existing_idx:
        op.drop_index('uq_dashboard_role_slot_shared', table_name='dashboard_layouts')

    op.execute("DELETE FROM dashboard_layouts WHERE user_id IS NOT NULL")

    existing_uqs = {uq['name'] for uq in insp.get_unique_constraints('dashboard_layouts')}
    if 'uq_dashboard_role_slot' not in existing_uqs:
        op.create_unique_constraint(
            'uq_dashboard_role_slot', 'dashboard_layouts', ['role', 'slot']
        )

    cols = {c['name'] for c in insp.get_columns('dashboard_layouts')}
    if 'user_id' in cols:
        try:
            op.drop_constraint(
                'fk_dashboard_layouts_user_id_users',
                'dashboard_layouts', type_='foreignkey'
            )
        except Exception:
            pass
        op.drop_column('dashboard_layouts', 'user_id')
