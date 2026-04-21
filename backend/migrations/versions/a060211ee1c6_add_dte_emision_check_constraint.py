"""add_dte_emision_check_constraint

Revision ID: a060211ee1c6
Revises: 89d2661d7423
Create Date: 2026-04-21 14:59:53.031068

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a060211ee1c6'
down_revision: Union[str, Sequence[str], None] = '89d2661d7423'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_check_constraint(
        "ck_dte_emision_one_document",
        "dte_emisiones",
        "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
        "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_dte_emision_one_document", "dte_emisiones", type_="check")
