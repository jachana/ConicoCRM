"""merge heads contactos + tipo_dte + nv_numero

Revision ID: d0e1f2a3b4c5
Revises: b9b8e073d777, e5dk4lof5h1c, c9d0e1f2a3b4
Create Date: 2026-04-29 12:00:00.000000

Merge migration. Three independent branches were created off of
``z5a6b7c8d9e0`` / ``181f2123993d`` and reached the head simultaneously:

* ``b9b8e073d777`` — align_nv_numero_with_id
* ``e5dk4lof5h1c`` — add_tipo_dte_to_facturas
* ``c9d0e1f2a3b4`` — add_contactos_empresa

This is a no-op merge to collapse them back into a single linear head.
"""
from typing import Sequence, Union


revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = (
    "b9b8e073d777",
    "e5dk4lof5h1c",
    "c9d0e1f2a3b4",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
