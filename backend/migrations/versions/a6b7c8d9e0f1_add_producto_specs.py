"""add_producto_specs

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
Create Date: 2026-05-01 00:00:00.000000

Add specs (technical specifications) field to Product model.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a6b7c8d9e0f1"
down_revision: Union[str, Sequence[str], None] = "z5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("productos", sa.Column("specs", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("productos", "specs")
