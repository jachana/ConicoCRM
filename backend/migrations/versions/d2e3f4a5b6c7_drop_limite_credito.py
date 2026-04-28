"""drop limite_credito from empresas (unify with linea_credito)

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-04-27 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("empresas", "limite_credito")


def downgrade() -> None:
    op.add_column("empresas", sa.Column("limite_credito", sa.Numeric(14, 2), nullable=True))
