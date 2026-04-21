"""add_server_default_nc_nd_dte_estado

Revision ID: 6b7dd91d465c
Revises: 16cb8d25ab8f
Create Date: 2026-04-21 15:37:46.434985

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6b7dd91d465c'
down_revision: Union[str, Sequence[str], None] = '16cb8d25ab8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('notas_credito', 'dte_estado', server_default=sa.text("'no_emitida'"))
    op.alter_column('notas_debito', 'dte_estado', server_default=sa.text("'no_emitida'"))


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('notas_credito', 'dte_estado', server_default=None)
    op.alter_column('notas_debito', 'dte_estado', server_default=None)
