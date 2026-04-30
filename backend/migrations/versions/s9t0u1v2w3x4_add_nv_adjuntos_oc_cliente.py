"""add nv adjuntos table + numero_oc_cliente column

Revision ID: s9t0u1v2w3x4
Revises: d0e1f2a3b4c5, r8s9t0u1v2w3
Create Date: 2026-04-29

Merge migration that also:
- adds ``nota_venta_adjuntos`` table for client OC / arbitrary attachments
- adds ``numero_oc_cliente`` text column on ``nota_ventas``

"""
from alembic import op
import sqlalchemy as sa


revision = 's9t0u1v2w3x4'
down_revision = ('d0e1f2a3b4c5', 'r8s9t0u1v2w3')
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'nota_ventas',
        sa.Column('numero_oc_cliente', sa.String(length=100), nullable=True),
    )
    op.create_table(
        'nota_venta_adjuntos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nv_id', sa.Integer(), nullable=False),
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
        sa.ForeignKeyConstraint(['nv_id'], ['nota_ventas.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subido_por_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_nota_venta_adjuntos_nv_id',
        'nota_venta_adjuntos',
        ['nv_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_nota_venta_adjuntos_nv_id', 'nota_venta_adjuntos')
    op.drop_table('nota_venta_adjuntos')
    op.drop_column('nota_ventas', 'numero_oc_cliente')
