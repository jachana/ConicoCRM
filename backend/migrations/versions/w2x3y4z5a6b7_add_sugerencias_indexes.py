"""add_sugerencias_indexes

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Create Date: 2026-04-24 00:00:00.000000

Adds composite indexes to speed up the sugerencias query:
  - facturas(empresa_id, fecha, estado)
  - facturas(cliente_id, fecha, estado)
  - factura_lineas(producto_id)
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'w2x3y4z5a6b7'
down_revision: Union[str, Sequence[str], None] = 'b56c995d5d72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add indexes to support sugerencias productos query."""
    op.create_index(
        'ix_facturas_empresa_fecha_estado',
        'facturas',
        ['empresa_id', 'fecha', 'estado'],
    )
    op.create_index(
        'ix_facturas_cliente_fecha_estado',
        'facturas',
        ['cliente_id', 'fecha', 'estado'],
    )
    op.create_index(
        'ix_factura_lineas_producto_id',
        'factura_lineas',
        ['producto_id'],
    )


def downgrade() -> None:
    """Remove sugerencias indexes."""
    op.drop_index('ix_factura_lineas_producto_id', table_name='factura_lineas')
    op.drop_index('ix_facturas_cliente_fecha_estado', table_name='facturas')
    op.drop_index('ix_facturas_empresa_fecha_estado', table_name='facturas')
