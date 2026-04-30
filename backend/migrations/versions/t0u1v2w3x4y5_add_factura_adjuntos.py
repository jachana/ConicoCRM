"""add factura adjuntos table

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-04-29

"""
from alembic import op
import sqlalchemy as sa


revision = 't0u1v2w3x4y5'
down_revision = 's9t0u1v2w3x4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'factura_adjuntos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('factura_id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(length=255), nullable=False),
        sa.Column('ruta', sa.String(length=500), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column(
            'subido_en',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.Column('subido_por_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['factura_id'], ['facturas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subido_por_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_factura_adjuntos_factura_id',
        'factura_adjuntos',
        ['factura_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_factura_adjuntos_factura_id', 'factura_adjuntos')
    op.drop_table('factura_adjuntos')
