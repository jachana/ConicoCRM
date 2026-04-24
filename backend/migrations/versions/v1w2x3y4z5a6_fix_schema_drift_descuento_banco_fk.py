"""fix_schema_drift_descuento_banco_fk

Revision ID: v1w2x3y4z5a6
Revises: 93d996331edd
Create Date: 2026-04-23 16:30:00.000000

Fixes two schema drifts that were accidentally bundled into the marcas
migration by autogenerate:
  1. cotizacion_lineas.descuento: REAL -> Numeric(5,2)
  2. facturas.banco_receptor_id FK: recreated with ondelete='SET NULL'
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'v1w2x3y4z5a6'
down_revision: Union[str, Sequence[str], None] = '93d996331edd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('cotizacion_lineas', 'descuento',
               existing_type=sa.REAL(),
               type_=sa.Numeric(precision=5, scale=2),
               existing_nullable=False,
               existing_server_default=sa.text('0.0'))
    op.drop_constraint('facturas_banco_receptor_id_fkey', 'facturas', type_='foreignkey')
    op.create_foreign_key(None, 'facturas', 'banco_receptores', ['banco_receptor_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(None, 'facturas', type_='foreignkey')
    op.create_foreign_key('facturas_banco_receptor_id_fkey', 'facturas', 'banco_receptores', ['banco_receptor_id'], ['id'])
    op.alter_column('cotizacion_lineas', 'descuento',
               existing_type=sa.Numeric(precision=5, scale=2),
               type_=sa.REAL(),
               existing_nullable=False,
               existing_server_default=sa.text('0.0'))
