"""enable_unaccent

Revision ID: b8c9d0e1f2a3
Revises: b7c8d9e0f1a2
Create Date: 2026-04-28 00:00:00.000000

Habilita la extensión unaccent de PostgreSQL para búsquedas
insensibles a tildes/diacríticos en toda la aplicación.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS unaccent")
