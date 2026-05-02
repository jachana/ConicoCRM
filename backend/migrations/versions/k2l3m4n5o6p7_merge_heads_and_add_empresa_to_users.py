"""Merge all heads and add empresa_id to users table

Revision ID: k2l3m4n5o6p7
Revises: c9d0e1f2g3h4, g8h9i0j1k2l3, j1k2l3m4n5o6
Create Date: 2026-05-01 21:00:00.000000

Merges the three divergent migration heads and adds the missing empresa_id
column to the users table that the User model expects.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "k2l3m4n5o6p7"
down_revision: Union[str, Sequence[str], None] = ["c9d0e1f2g3h4", "g8h9i0j1k2l3", "j1k2l3m4n5o6"]
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add empresa_id to users table
    bind = op.get_bind()
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("empresa_id", sa.Integer(), nullable=True)
        )

    # Add foreign key constraint if not SQLite
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_users_empresa_id",
            "users",
            "empresas",
            ["empresa_id"],
            ["id"],
            ondelete="SET NULL"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_constraint("fk_users_empresa_id", "users", type_="foreignkey")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("empresa_id")
