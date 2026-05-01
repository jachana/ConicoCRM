"""add exclude_recordatorio field to Factura

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-05-01

Add exclude_recordatorio Boolean field to Factura model to allow excluding
specific invoices from automatic reminder tasks.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "j1k2l3m4n5o6"
down_revision: Union[str, Sequence[str], None] = "i0j1k2l3m4n5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "facturas",
        sa.Column("exclude_recordatorio", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("facturas", "exclude_recordatorio")
