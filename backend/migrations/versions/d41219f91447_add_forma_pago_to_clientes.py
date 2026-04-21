"""add_forma_pago_to_clientes

Revision ID: d41219f91447
Revises: n4o5p6q7r8s9
Create Date: 2026-04-21 10:46:49.293768

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd41219f91447'
down_revision: Union[str, Sequence[str], None] = 'n4o5p6q7r8s9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clientes", sa.Column("forma_pago", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("clientes", "forma_pago")
