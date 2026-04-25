"""add_boletas

Revision ID: z5a6b7c8d9e0
Revises: y4z5a6b7c8d9
Create Date: 2026-04-25 10:00:00.000000

W1-04: tablas boletas + boleta_lineas, FK boleta_id en dte_emisiones y notas_credito,
seeds system_config boleta_last_id.

Notes:
- No hay tabla `permissions` en este proyecto; los permisos se manejan via
  `permission_overrides` (user-level overrides). El seed de permisos se omite;
  Task 8 lo gestiona en código Python.
- El check constraint ck_dte_emision_one_document se aplica solo en PostgreSQL
  (identical behavior a la migracion a060211ee1c6 que lo creó originalmente).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'z5a6b7c8d9e0'
down_revision: Union[str, Sequence[str], None] = 'y4z5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # boletas
    # ------------------------------------------------------------------
    op.create_table(
        'boletas',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('numero', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('tipo_dte', sa.String(length=2), nullable=False),
        sa.Column('cliente_id', sa.Integer(), sa.ForeignKey('clientes.id', ondelete='SET NULL'), nullable=True),
        sa.Column('empresa_id', sa.Integer(), sa.ForeignKey('empresas.id', ondelete='SET NULL'), nullable=True),
        sa.Column('patente_vehiculo', sa.String(length=10), nullable=True),
        sa.Column('email_envio', sa.String(length=255), nullable=True),
        sa.Column('nombre_receptor', sa.String(length=255), nullable=True),
        sa.Column('rut_receptor', sa.String(length=20), nullable=True),
        sa.Column('vendedor_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('metodo_pago', sa.String(length=20), nullable=False, server_default='efectivo'),
        sa.Column('total_neto', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('total_iva', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('total', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('monto_pagado', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('estado', sa.String(length=20), nullable=False, server_default='emitida'),
        sa.Column('dte_estado', sa.String(length=20), nullable=False, server_default='no_emitida'),
        sa.Column('xml_raw', sa.Text(), nullable=True),
        sa.Column('track_id', sa.String(length=100), nullable=True),
        sa.Column('folio_sii', sa.Integer(), nullable=True),
        sa.Column('email_enviado_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_boletas_numero', 'boletas', ['numero'], unique=True)
    op.create_index('ix_boletas_fecha', 'boletas', ['fecha'])
    op.create_index('ix_boletas_cliente_id', 'boletas', ['cliente_id'])
    op.create_index('ix_boletas_patente', 'boletas', ['patente_vehiculo'])
    op.create_index('ix_boletas_dte_estado', 'boletas', ['dte_estado'])
    op.create_index('ix_boletas_track_id', 'boletas', ['track_id'])

    # ------------------------------------------------------------------
    # boleta_lineas
    # ------------------------------------------------------------------
    op.create_table(
        'boleta_lineas',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('boleta_id', sa.Integer(), sa.ForeignKey('boletas.id', ondelete='CASCADE'), nullable=False),
        sa.Column('orden', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('producto_id', sa.Integer(), sa.ForeignKey('productos.id', ondelete='SET NULL'), nullable=True),
        sa.Column('descripcion', sa.String(length=500), nullable=False),
        sa.Column('cantidad', sa.Numeric(10, 2), nullable=False, server_default='1'),
        sa.Column('precio_unitario', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('descuento_pct', sa.Numeric(5, 2), nullable=False, server_default='0'),
        sa.Column('exenta', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('total_neto', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('iva', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('total_linea', sa.Numeric(12, 2), nullable=False, server_default='0'),
    )
    op.create_index('ix_boleta_lineas_boleta_id', 'boleta_lineas', ['boleta_id'])

    # ------------------------------------------------------------------
    # FK boleta_id en dte_emisiones + recrear check constraint
    # ------------------------------------------------------------------
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        op.add_column('dte_emisiones', sa.Column('boleta_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_dte_emisiones_boleta_id', 'dte_emisiones', 'boletas',
            ['boleta_id'], ['id'], ondelete='CASCADE',
        )
        # Drop and recreate the one-document check constraint to include boleta_id.
        # On SQLite this constraint was never created (see migration a060211ee1c6
        # which guards with pg_constraint), so we skip on SQLite.
        result = bind.execute(sa.text(
            "SELECT 1 FROM pg_constraint WHERE conname = 'ck_dte_emision_one_document'"
        )).fetchone()
        if result:
            op.drop_constraint('ck_dte_emision_one_document', 'dte_emisiones', type_='check')
        op.create_check_constraint(
            'ck_dte_emision_one_document',
            'dte_emisiones',
            "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) = 1"
        )
    else:
        # SQLite: batch_alter_table is required to add columns to existing tables
        # with constraints. Check constraints are not enforced by SQLite anyway.
        with op.batch_alter_table('dte_emisiones') as batch_op:
            batch_op.add_column(sa.Column('boleta_id', sa.Integer(), nullable=True))

    # ------------------------------------------------------------------
    # FK boleta_id en notas_credito
    # ------------------------------------------------------------------
    if bind.dialect.name == 'postgresql':
        op.add_column('notas_credito', sa.Column('boleta_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_notas_credito_boleta_id', 'notas_credito', 'boletas',
            ['boleta_id'], ['id'], ondelete='SET NULL',
        )
    else:
        with op.batch_alter_table('notas_credito') as batch_op:
            batch_op.add_column(sa.Column('boleta_id', sa.Integer(), nullable=True))

    # ------------------------------------------------------------------
    # Seed system_config: folio counter for boletas
    # ------------------------------------------------------------------
    if bind.dialect.name == 'postgresql':
        op.execute(
            "INSERT INTO system_config (key, value) VALUES ('boleta_last_id', '0') "
            "ON CONFLICT (key) DO NOTHING"
        )
    else:
        # SQLite: use INSERT OR IGNORE
        op.execute(
            "INSERT OR IGNORE INTO system_config (key, value) VALUES ('boleta_last_id', '0')"
        )


def downgrade() -> None:
    bind = op.get_bind()

    # Remove system_config seed
    op.execute("DELETE FROM system_config WHERE key = 'boleta_last_id'")

    # notas_credito: remove boleta_id
    if bind.dialect.name == 'postgresql':
        op.drop_constraint('fk_notas_credito_boleta_id', 'notas_credito', type_='foreignkey')
        op.drop_column('notas_credito', 'boleta_id')
    else:
        with op.batch_alter_table('notas_credito') as batch_op:
            batch_op.drop_column('boleta_id')

    # dte_emisiones: restore original check constraint (without boleta_id) + remove FK
    if bind.dialect.name == 'postgresql':
        result = bind.execute(sa.text(
            "SELECT 1 FROM pg_constraint WHERE conname = 'ck_dte_emision_one_document'"
        )).fetchone()
        if result:
            op.drop_constraint('ck_dte_emision_one_document', 'dte_emisiones', type_='check')
        op.create_check_constraint(
            'ck_dte_emision_one_document',
            'dte_emisiones',
            "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) = 1"
        )
        op.drop_constraint('fk_dte_emisiones_boleta_id', 'dte_emisiones', type_='foreignkey')
        op.drop_column('dte_emisiones', 'boleta_id')
    else:
        with op.batch_alter_table('dte_emisiones') as batch_op:
            batch_op.drop_column('boleta_id')

    # boleta_lineas
    op.drop_index('ix_boleta_lineas_boleta_id', table_name='boleta_lineas')
    op.drop_table('boleta_lineas')

    # boletas
    op.drop_index('ix_boletas_track_id', table_name='boletas')
    op.drop_index('ix_boletas_dte_estado', table_name='boletas')
    op.drop_index('ix_boletas_patente', table_name='boletas')
    op.drop_index('ix_boletas_cliente_id', table_name='boletas')
    op.drop_index('ix_boletas_fecha', table_name='boletas')
    op.drop_index('ix_boletas_numero', table_name='boletas')
    op.drop_table('boletas')
