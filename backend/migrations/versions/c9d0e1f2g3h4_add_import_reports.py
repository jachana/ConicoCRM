"""Add import reports table.

Revision ID: c9d0e1f2g3h4
Revises: b18e782cc8db
Create Date: 2026-05-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c9d0e1f2g3h4'
down_revision = 'b18e782cc8db'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    # May already exist on DBs where b7c8d9e0f1a2 ran first; those DBs already have the table.
    if 'payment_import_reports' not in inspector.get_table_names():
        op.create_table(
            'payment_import_reports',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('import_id', sa.String(36), nullable=False),
            sa.Column('created_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('updated_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('pending_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('error_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('total_rows', sa.Integer(), nullable=False),
            sa.Column('status', sa.String(20), server_default='pending', nullable=False),
            sa.Column('report_json', sa.Text(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('filename', sa.String(255), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            # Included here so fresh installs get all columns without b7c8d9e0f1a2 needing the table pre-existing
            sa.Column('created_bodega_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('updated_bodega_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('created_sede_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('updated_sede_count', sa.Integer(), server_default='0', nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('import_id', name='uq_import_id'),
        )
        op.create_index('ix_import_id', 'payment_import_reports', ['import_id'], unique=True)


def downgrade() -> None:
    op.drop_table('payment_import_reports')
