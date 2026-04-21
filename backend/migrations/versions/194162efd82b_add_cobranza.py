"""add_cobranza

Revision ID: 194162efd82b
Revises: d41219f91447
Create Date: 2026-04-21 11:03:22.795947

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "194162efd82b"
down_revision: Union[str, Sequence[str], None] = "d41219f91447"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("facturas", sa.Column("origen", sa.String(10), nullable=False, server_default="manual"))
    op.add_column("facturas", sa.Column("xml_raw", sa.Text, nullable=True))
    op.add_column("facturas", sa.Column("ultimo_recordatorio", sa.Date, nullable=True))
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("facturas") as batch_op:
            batch_op.alter_column("cliente_id", nullable=True)
    else:
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
        ),
        sa.Column("dias_frecuencia", sa.Integer, nullable=False, server_default="7"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )
    op.create_index("ix_cobranza_config_empresa_id", "cobranza_config", ["empresa_id"])


def downgrade() -> None:
    op.drop_index("ix_cobranza_config_empresa_id", table_name="cobranza_config")
    op.drop_table("cobranza_config")
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("facturas") as batch_op:
            batch_op.alter_column("cliente_id", nullable=False)
    else:
        op.alter_column("facturas", "cliente_id", nullable=False)
    op.drop_column("facturas", "ultimo_recordatorio")
    op.drop_column("facturas", "xml_raw")
    op.drop_column("facturas", "origen")
