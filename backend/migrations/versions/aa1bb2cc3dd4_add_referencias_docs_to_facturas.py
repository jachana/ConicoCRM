"""add_referencias_docs_to_facturas

Revision ID: aa1bb2cc3dd4
Revises: z5a6b7c8d9e0
Create Date: 2026-04-28 00:00:00.000000

Adds referencias_docs JSON column to facturas table.
Stores an array of document references (OC, HES, contrato, guía de despacho)
that appear in the DTE XML payload sent to SII.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aa1bb2cc3dd4"
down_revision: Union[str, None] = "z5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "facturas",
        sa.Column("referencias_docs", sa.JSON(), nullable=True, server_default=sa.text("'[]'::json")),
    )


def downgrade() -> None:
    op.drop_column("facturas", "referencias_docs")
