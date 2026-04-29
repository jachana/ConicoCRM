"""merge_metodo_pago_and_referencias_docs

Revision ID: 181f2123993d
Revises: a2b3c4d5e6f7, aa1bb2cc3dd4
Create Date: 2026-04-28 21:44:38.193626

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '181f2123993d'
down_revision: Union[str, Sequence[str], None] = ('a2b3c4d5e6f7', 'aa1bb2cc3dd4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
