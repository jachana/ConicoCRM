"""add_contactos_empresa

Revision ID: c9d0e1f2a3b4
Revises: z5a6b7c8d9e0
Create Date: 2026-04-29 10:00:00.000000

Adds contactos_empresa table for company contact people.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "z5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contactos_empresa",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("cargo", sa.String(100), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("telefono", sa.String(50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contactos_empresa_empresa_id", "contactos_empresa", ["empresa_id"])


def downgrade() -> None:
    op.drop_index("ix_contactos_empresa_empresa_id", table_name="contactos_empresa")
    op.drop_table("contactos_empresa")
