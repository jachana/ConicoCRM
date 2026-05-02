"""add historico to ordenes_compra

Revision ID: b1c2d3e4f5a6
Revises: 9d20d2707eb9
Branch Labels: None
Depends on: None

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = '9d20d2707eb9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ordenes_compra', sa.Column('historico', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('ordenes_compra', 'historico')
