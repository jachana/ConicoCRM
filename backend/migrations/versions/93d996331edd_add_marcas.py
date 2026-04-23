"""add_marcas

Revision ID: 93d996331edd
Revises: p6q7r8s9t0u1
Create Date: 2026-04-23 16:11:20.084077

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '93d996331edd'
down_revision: Union[str, Sequence[str], None] = 'p6q7r8s9t0u1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('marcas',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('nombre', sa.String(length=100), nullable=False),
    sa.Column('activa', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('nombre')
    )
    op.execute("""
        INSERT INTO marcas (nombre, activa) VALUES
        ('Shell', true), ('Mobil', true), ('Total', true), ('Lubrax', true), ('Otros', true)
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('marcas')
