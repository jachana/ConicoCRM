"""add metodo_pago and plazo_dias to cotizaciones/nota_ventas/facturas

Revision ID: a2b3c4d5e6f7
Revises: z5a6b7c8d9e0
Create Date: 2026-04-28 00:00:00.000000

Adds structured payment method + payment term (días) fields to all sale documents.
Replaces the old free-text terminos_pago approach with two independent fields:
  - metodo_pago: enum (efectivo, tarjeta_credito, tarjeta_debito, transferencia,
                       cheque, vale_vista, credito_simple, otros)
  - plazo_dias:  int (0 = al contado, N = N días)

Also backfills pagos.metodo_pago from old catalog (debito→tarjeta_debito, etc.)
and facturas.metodo_pago from old capitalized values.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, None] = "z5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cotizaciones", sa.Column("metodo_pago", sa.String(50), nullable=True))
    op.add_column("cotizaciones", sa.Column("plazo_dias", sa.Integer, nullable=False, server_default="0"))

    op.add_column("nota_ventas", sa.Column("metodo_pago", sa.String(50), nullable=True))
    op.add_column("nota_ventas", sa.Column("plazo_dias", sa.Integer, nullable=False, server_default="0"))

    op.add_column("facturas", sa.Column("plazo_dias", sa.Integer, nullable=False, server_default="0"))

    # Backfill pagos — map old catalog keys to new ones
    op.execute("UPDATE pagos SET metodo_pago = 'tarjeta_debito' WHERE metodo_pago = 'debito'")
    op.execute("UPDATE pagos SET metodo_pago = 'tarjeta_credito' WHERE metodo_pago = 'credito'")
    op.execute("UPDATE pagos SET metodo_pago = 'transferencia' WHERE metodo_pago = 'deposito'")

    # Backfill facturas.metodo_pago — normalize old capitalized/accented values
    op.execute("UPDATE facturas SET metodo_pago = 'efectivo' WHERE metodo_pago = 'Efectivo'")
    op.execute("UPDATE facturas SET metodo_pago = 'transferencia' WHERE metodo_pago = 'Transferencia'")
    op.execute("UPDATE facturas SET metodo_pago = 'cheque' WHERE metodo_pago = 'Cheque'")
    op.execute("UPDATE facturas SET metodo_pago = 'tarjeta_debito' WHERE metodo_pago IN ('Débito', 'debito')")
    op.execute("UPDATE facturas SET metodo_pago = 'tarjeta_credito' WHERE metodo_pago IN ('Crédito', 'credito')")
    op.execute("UPDATE facturas SET metodo_pago = 'transferencia' WHERE metodo_pago IN ('Mixto', 'mixto')")


def downgrade() -> None:
    op.drop_column("facturas", "plazo_dias")
    op.drop_column("nota_ventas", "plazo_dias")
    op.drop_column("nota_ventas", "metodo_pago")
    op.drop_column("cotizaciones", "plazo_dias")
    op.drop_column("cotizaciones", "metodo_pago")
