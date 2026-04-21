"""add_cobranza

Revision ID: 194162efd82b
Revises: d41219f91447
Create Date: 2026-04-21 11:03:22.795947

"""
from alembic import op
import sqlalchemy as sa

revision = "194162efd82b"
down_revision = "d41219f91447"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("facturas", sa.Column("origen", sa.String(10), nullable=False, server_default="manual"))
    op.add_column("facturas", sa.Column("xml_raw", sa.Text, nullable=True))
    op.add_column("facturas", sa.Column("ultimo_recordatorio", sa.Date, nullable=True))
    op.alter_column("facturas", "cliente_id", nullable=True)
    op.create_table(
        "cobranza_config",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "empresa_id",
            sa.Integer,
            sa.ForeignKey("empresas.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("dias_frecuencia", sa.Integer, nullable=False, server_default="7"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("cobranza_config")
    op.alter_column("facturas", "cliente_id", nullable=False)
    op.drop_column("facturas", "ultimo_recordatorio")
    op.drop_column("facturas", "xml_raw")
    op.drop_column("facturas", "origen")
