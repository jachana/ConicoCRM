"""add sedes_despacho table and update nota_ventas

Revision ID: p6q7r8s9t0u1
Revises: a38244a074a0
Create Date: 2026-04-23 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "p6q7r8s9t0u1"
down_revision: Union[str, None] = "a38244a074a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sedes_despacho (
            id SERIAL PRIMARY KEY,
            empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
            nombre VARCHAR(255) NOT NULL,
            direccion VARCHAR(500) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute(
        "ALTER TABLE nota_ventas ADD COLUMN IF NOT EXISTS "
        "sede_despacho_id INTEGER REFERENCES sedes_despacho(id) ON DELETE SET NULL"
    )
    op.execute("ALTER TABLE nota_ventas DROP COLUMN IF EXISTS direccion_despacho")


def downgrade() -> None:
    op.execute("ALTER TABLE nota_ventas ADD COLUMN IF NOT EXISTS direccion_despacho TEXT")
    op.execute("ALTER TABLE nota_ventas DROP COLUMN IF EXISTS sede_despacho_id")
    op.execute("DROP TABLE IF EXISTS sedes_despacho")
