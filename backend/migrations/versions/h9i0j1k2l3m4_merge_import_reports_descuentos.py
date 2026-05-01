"""Merge heads: import_reports + solicitudes_descuento + nc_cliente_id

Revision ID: h9i0j1k2l3m4
Revises: c9d0e1f2g3h4, g8h9i0j1k2l3, a6b7c8d9e0f1
Create Date: 2026-05-01 12:15:00.000000

Merge migration to consolidate three independent branches back into a single head.
"""
from typing import Sequence, Union


revision: str = "h9i0j1k2l3m4"
down_revision: Union[str, Sequence[str], None] = (
    "c9d0e1f2g3h4",
    "g8h9i0j1k2l3",
    "a6b7c8d9e0f1",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
