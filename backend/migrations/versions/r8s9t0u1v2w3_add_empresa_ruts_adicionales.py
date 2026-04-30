"""add_empresa_ruts_adicionales

Revision ID: r8s9t0u1v2w3
Revises: g1h2i3j4k5l6, q7r8s9t0u1v2
Create Date: 2026-04-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'r8s9t0u1v2w3'
down_revision = ('g1h2i3j4k5l6', 'q7r8s9t0u1v2')
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'empresa_ruts_adicionales',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.Column('rut', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('rut'),
    )
    op.create_index('ix_empresa_ruts_adicionales_empresa_id', 'empresa_ruts_adicionales', ['empresa_id'])


def downgrade() -> None:
    op.drop_index('ix_empresa_ruts_adicionales_empresa_id', 'empresa_ruts_adicionales')
    op.drop_table('empresa_ruts_adicionales')
