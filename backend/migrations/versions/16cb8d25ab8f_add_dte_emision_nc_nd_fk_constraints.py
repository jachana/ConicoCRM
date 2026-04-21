"""add_dte_emision_nc_nd_fk_constraints

Revision ID: 16cb8d25ab8f
Revises: e43dce1d2bd5
Create Date: 2026-04-21 15:06:05.633754

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '16cb8d25ab8f'
down_revision: Union[str, Sequence[str], None] = 'e43dce1d2bd5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_foreign_key(
        "fk_dte_emisiones_nota_credito_id",
        "dte_emisiones", "notas_credito",
        ["nota_credito_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_dte_emisiones_nota_debito_id",
        "dte_emisiones", "notas_debito",
        ["nota_debito_id"], ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_dte_emisiones_nota_debito_id", "dte_emisiones", type_="foreignkey")
    op.drop_constraint("fk_dte_emisiones_nota_credito_id", "dte_emisiones", type_="foreignkey")
