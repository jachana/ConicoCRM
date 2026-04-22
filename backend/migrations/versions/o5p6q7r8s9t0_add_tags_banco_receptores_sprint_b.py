"""add tags, banco_receptores, and sprint-B columns

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-04-22 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "o5p6q7r8s9t0"
down_revision: Union[str, None] = "6b7dd91d465c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use IF NOT EXISTS throughout — safe to run even if migrate_sprint_a.py
    # was already applied manually on the target database.
    op.execute("""
        CREATE TABLE IF NOT EXISTS banco_receptores (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(200) NOT NULL UNIQUE,
            activo BOOLEAN NOT NULL DEFAULT true
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS producto_tags (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL UNIQUE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_producto_tags_nombre ON producto_tags (nombre)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS producto_tag_link (
            producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES producto_tags(id) ON DELETE CASCADE,
            PRIMARY KEY (producto_id, tag_id)
        )
    """)

    op.execute("ALTER TABLE nota_ventas ADD COLUMN IF NOT EXISTS direccion_despacho TEXT")
    op.execute(
        "ALTER TABLE nota_ventas ADD COLUMN IF NOT EXISTS "
        "retiro_en_conico BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE nota_ventas ADD COLUMN IF NOT EXISTS terminos_pago VARCHAR(255)"
    )
    op.execute(
        "ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS "
        "validez_dias INTEGER NOT NULL DEFAULT 5"
    )
    op.execute(
        "ALTER TABLE cotizacion_lineas ADD COLUMN IF NOT EXISTS "
        "descuento REAL NOT NULL DEFAULT 0.0"
    )
    op.execute(
        "ALTER TABLE facturas ADD COLUMN IF NOT EXISTS "
        "banco_receptor_id INTEGER REFERENCES banco_receptores(id)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE facturas DROP COLUMN IF EXISTS banco_receptor_id")
    op.execute("ALTER TABLE cotizacion_lineas DROP COLUMN IF EXISTS descuento")
    op.execute("ALTER TABLE cotizaciones DROP COLUMN IF EXISTS validez_dias")
    op.execute("ALTER TABLE nota_ventas DROP COLUMN IF EXISTS terminos_pago")
    op.execute("ALTER TABLE nota_ventas DROP COLUMN IF EXISTS retiro_en_conico")
    op.execute("ALTER TABLE nota_ventas DROP COLUMN IF EXISTS direccion_despacho")
    op.drop_table("producto_tag_link")
    op.drop_table("producto_tags")
    op.drop_table("banco_receptores")
