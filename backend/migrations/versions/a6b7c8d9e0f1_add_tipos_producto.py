"""add tipos_producto + producto_tipo_link

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
Create Date: 2026-04-29 12:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a6b7c8d9e0f1"
down_revision: Union[str, Sequence[str], None] = "z5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SEED_NOMBRES = ["hidraulico", "motor", "transmision"]


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "tipos_producto",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(length=100), nullable=False, unique=True),
    )
    op.create_index("ix_tipos_producto_nombre", "tipos_producto", ["nombre"])

    op.create_table(
        "producto_tipo_link",
        sa.Column(
            "producto_id",
            sa.Integer(),
            sa.ForeignKey("productos.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tipo_id",
            sa.Integer(),
            sa.ForeignKey("tipos_producto.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    if bind.dialect.name == "postgresql":
        for nombre in SEED_NOMBRES:
            op.execute(
                f"INSERT INTO tipos_producto (nombre) VALUES ('{nombre}') "
                f"ON CONFLICT (nombre) DO NOTHING"
            )
    else:
        for nombre in SEED_NOMBRES:
            op.execute(
                f"INSERT OR IGNORE INTO tipos_producto (nombre) VALUES ('{nombre}')"
            )


def downgrade() -> None:
    op.drop_table("producto_tipo_link")
    op.drop_index("ix_tipos_producto_nombre", table_name="tipos_producto")
    op.drop_table("tipos_producto")
