"""add proveedor onboarding columns

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-04-30 13:00:00.000000

Adds razon_social, giro, direccion, comuna, condicion_pago to proveedores
to support [Onboarding] Import Proveedores via xlsx.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_COLUMNS = [
    ("razon_social", sa.String(length=255)),
    ("giro", sa.String(length=255)),
    ("direccion", sa.String(length=255)),
    ("comuna", sa.String(length=120)),
    ("condicion_pago", sa.String(length=80)),
]


def upgrade() -> None:
    with op.batch_alter_table("proveedores") as batch:
        for name, type_ in NEW_COLUMNS:
            batch.add_column(sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("proveedores") as batch:
        for name, _ in NEW_COLUMNS:
            batch.drop_column(name)
