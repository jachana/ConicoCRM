"""add_is_locked_cotizaciones_nota_ventas

Revision ID: a38244a074a0
Revises: o5p6q7r8s9t0
Create Date: 2026-04-22 20:10:27.375927

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a38244a074a0'
down_revision: Union[str, Sequence[str], None] = 'o5p6q7r8s9t0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cotizaciones', sa.Column('is_locked', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('nota_ventas', sa.Column('is_locked', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('nota_ventas', 'is_locked')
    op.drop_column('cotizaciones', 'is_locked')
