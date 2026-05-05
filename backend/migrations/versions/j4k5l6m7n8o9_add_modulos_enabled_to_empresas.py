"""add_modulos_enabled_to_empresas

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-05-05 00:00:00.000000

Adds modulos_enabled JSONB column to empresas with default {} and backfills
all existing rows with all optional modules enabled (all-on behaviour).
"""
import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = 'j4k5l6m7n8o9'
down_revision: Union[str, Sequence[str], None] = 'i3j4k5l6m7n8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ALL_ON: dict = {
    "cotizaciones": True,
    "notas_venta": True,
    "facturas": True,
    "boletas": True,
    "guias_despacho": True,
    "nota_credito": True,
    "nota_debito": True,
    "proveedores": True,
    "ordenes_compra": True,
    "facturas_compra": True,
    "inventario": True,
    "listas_precios": True,
    "precios_especiales": True,
    "pagos": True,
    "cobranza": True,
    "bancos_receptores": True,
    "libros": True,
    "dte_recepcion": True,
    "oportunidades": True,
    "tareas": True,
    "reglas_tareas": True,
    "rrhh_empleados": True,
    "rrhh_vacaciones": True,
    "rrhh_documentos": True,
    "aprobaciones_descuento": True,
    "aprobaciones_costo": True,
    "aprobaciones_margen": True,
}


def upgrade() -> None:
    op.add_column(
        'empresas',
        sa.Column('modulos_enabled', sa.JSON(), server_default=text("'{}'"), nullable=False),
    )
    bind = op.get_bind()
    bind.execute(
        text("UPDATE empresas SET modulos_enabled = :v WHERE modulos_enabled = '{}'::jsonb OR modulos_enabled IS NULL"),
        {"v": json.dumps(_ALL_ON)},
    )


def downgrade() -> None:
    op.drop_column('empresas', 'modulos_enabled')
