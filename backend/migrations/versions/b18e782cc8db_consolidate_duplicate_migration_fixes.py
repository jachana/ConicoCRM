"""consolidate_duplicate_migration_fixes

Revision ID: b18e782cc8db
Revises: 57449dcd3ca9, d0e1f2g3h4i5, j1k2l3m4n5o6, m4n5o6p7q8r9, n5o6p7q8r9s0, p8q9r0s1t2u3
Create Date: 2026-05-01 19:35:05.023963

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b18e782cc8db'
down_revision: Union[str, Sequence[str], None] = ('57449dcd3ca9', 'd0e1f2g3h4i5', 'j1k2l3m4n5o6', 'm4n5o6p7q8r9', 'n5o6p7q8r9s0', 'p8q9r0s1t2u3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
