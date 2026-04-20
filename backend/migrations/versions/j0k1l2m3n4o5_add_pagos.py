"""add pagos table

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "j0k1l2m3n4o5"
down_revision: Union[str, None] = "i9j0k1l2m3n4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pagos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("factura_id", sa.Integer, sa.ForeignKey("facturas.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("fecha", sa.Date, nullable=False),
        sa.Column("monto", sa.Numeric(12, 2), nullable=False),
        sa.Column("metodo_pago", sa.String(50), nullable=False),
        sa.Column("nota", sa.String(500), nullable=True),
        sa.Column("registrado_por_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("pagos")
