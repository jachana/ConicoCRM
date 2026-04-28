"""enable_unaccent

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
Create Date: 2026-04-28 00:00:00.000000

Habilita la extensión unaccent de PostgreSQL para búsquedas
insensibles a tildes/diacríticos en toda la aplicación.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a6b7c8d9e0f1'
down_revision: Union[str, Sequence[str], None] = 'z5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS unaccent")
