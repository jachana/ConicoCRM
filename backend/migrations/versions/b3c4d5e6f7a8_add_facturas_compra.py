"""add_facturas_compra

Revision ID: b3c4d5e6f7a8
Revises: u1v2w3x4y5z6
Create Date: 2026-04-29 00:00:00.000000

[DTE] Factura de Compra tipo 46: tablas facturas_compra + factura_compra_lineas,
FK factura_compra_id en dte_emisiones, actualiza check constraint, seed system_config.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'u1v2w3x4y5z6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # facturas_compra
    # ------------------------------------------------------------------
    op.create_table(
        'facturas_compra',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('numero', sa.Integer(), nullable=False),
        sa.Column('proveedor_id', sa.Integer(), sa.ForeignKey('proveedores.id', ondelete='SET NULL'), nullable=True),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('estado', sa.String(length=20), nullable=False, server_default='emitida'),
        sa.Column('nota', sa.Text(), nullable=True),
        sa.Column('total_neto', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('total_iva', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('total', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('dte_estado', sa.String(length=20), nullable=False, server_default='no_emitida'),
        sa.Column('xml_raw', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_facturas_compra_numero', 'facturas_compra', ['numero'], unique=True)
    op.create_index('ix_facturas_compra_fecha', 'facturas_compra', ['fecha'])
    op.create_index('ix_facturas_compra_dte_estado', 'facturas_compra', ['dte_estado'])

    # ------------------------------------------------------------------
    # factura_compra_lineas
    # ------------------------------------------------------------------
    op.create_table(
        'factura_compra_lineas',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('factura_compra_id', sa.Integer(), sa.ForeignKey('facturas_compra.id', ondelete='CASCADE'), nullable=False),
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('producto_id', sa.Integer(), sa.ForeignKey('productos.id', ondelete='SET NULL'), nullable=True),
        sa.Column('sku', sa.String(length=100), nullable=True),
        sa.Column('descripcion', sa.String(length=500), nullable=False),
        sa.Column('cantidad', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('valor_neto', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('total_neto', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('iva', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('total', sa.Numeric(12, 2), nullable=False, server_default='0'),
    )
    op.create_index('ix_factura_compra_lineas_factura_compra_id', 'factura_compra_lineas', ['factura_compra_id'])

    # ------------------------------------------------------------------
    # dte_emisiones: add factura_compra_id, update check constraint
    # ------------------------------------------------------------------
    new_ck = (
        "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN guia_despacho_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN factura_compra_id IS NOT NULL THEN 1 ELSE 0 END) = 1"
    )

    if bind.dialect.name == 'postgresql':
        # Drop old check constraint before adding column (PostgreSQL validates immediately)
        result = bind.execute(sa.text(
            "SELECT 1 FROM pg_constraint WHERE conname = 'ck_dte_emision_one_document'"
        )).fetchone()
        if result:
            op.drop_constraint('ck_dte_emision_one_document', 'dte_emisiones', type_='check')

        op.add_column('dte_emisiones', sa.Column('factura_compra_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_dte_emisiones_factura_compra_id', 'dte_emisiones', 'facturas_compra',
            ['factura_compra_id'], ['id'], ondelete='CASCADE',
        )
        op.create_check_constraint('ck_dte_emision_one_document', 'dte_emisiones', new_ck)
    else:
        with op.batch_alter_table('dte_emisiones') as batch_op:
            batch_op.add_column(sa.Column('factura_compra_id', sa.Integer(), nullable=True))

    # ------------------------------------------------------------------
    # Seed system_config: folio counter for facturas_compra
    # ------------------------------------------------------------------
    if bind.dialect.name == 'postgresql':
        op.execute(
            "INSERT INTO system_config (key, value) VALUES ('factura_compra_last_id', '0') "
            "ON CONFLICT (key) DO NOTHING"
        )
    else:
        op.execute(
            "INSERT OR IGNORE INTO system_config (key, value) VALUES ('factura_compra_last_id', '0')"
        )


def downgrade() -> None:
    bind = op.get_bind()

    # Remove system_config seed
    op.execute("DELETE FROM system_config WHERE key = 'factura_compra_last_id'")

    old_ck = (
        "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN guia_despacho_id IS NOT NULL THEN 1 ELSE 0 END) = 1"
    )

    if bind.dialect.name == 'postgresql':
        result = bind.execute(sa.text(
            "SELECT 1 FROM pg_constraint WHERE conname = 'ck_dte_emision_one_document'"
        )).fetchone()
        if result:
            op.drop_constraint('ck_dte_emision_one_document', 'dte_emisiones', type_='check')
        op.create_check_constraint('ck_dte_emision_one_document', 'dte_emisiones', old_ck)
        op.drop_constraint('fk_dte_emisiones_factura_compra_id', 'dte_emisiones', type_='foreignkey')
        op.drop_column('dte_emisiones', 'factura_compra_id')
    else:
        with op.batch_alter_table('dte_emisiones') as batch_op:
            batch_op.drop_column('factura_compra_id')

    op.drop_index('ix_factura_compra_lineas_factura_compra_id', table_name='factura_compra_lineas')
    op.drop_table('factura_compra_lineas')

    op.drop_index('ix_facturas_compra_dte_estado', table_name='facturas_compra')
    op.drop_index('ix_facturas_compra_fecha', table_name='facturas_compra')
    op.drop_index('ix_facturas_compra_numero', table_name='facturas_compra')
    op.drop_table('facturas_compra')
