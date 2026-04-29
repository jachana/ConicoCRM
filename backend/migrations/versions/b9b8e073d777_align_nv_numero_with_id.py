"""align_nv_numero_with_id

Revision ID: b9b8e073d777
Revises: 181f2123993d
Create Date: 2026-04-29 08:00:26.869084

Aligns nota_ventas.numero with id so the document number shown to users
matches the internal record id (URL, list, detail, PDF all consistent).

- Drops NOT NULL on numero (lets create flow set it post-flush from id).
- Two-pass backfill avoids unique-constraint collisions during update.
- Drops the SystemConfig key 'nv_last_id' (no longer used).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9b8e073d777'
down_revision: Union[str, Sequence[str], None] = '181f2123993d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.alter_column("nota_ventas", "numero", existing_type=sa.Integer(), nullable=True)
    # SQLite: column already permissive enough at runtime; ALTER COLUMN nullable
    # is a no-op via batch_alter_table for our purposes.

    # Two-pass backfill: park diverged rows on a unique negative offset, then
    # set numero = id. Avoids transient unique-constraint violations.
    op.execute(
        "UPDATE nota_ventas SET numero = -id - 1000000000 WHERE numero IS NULL OR numero <> id"
    )
    op.execute(
        "UPDATE nota_ventas SET numero = id WHERE numero < 0"
    )

    op.execute("DELETE FROM system_config WHERE key = 'nv_last_id'")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.alter_column("nota_ventas", "numero", existing_type=sa.Integer(), nullable=False)
