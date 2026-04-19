"""add empresas table, extend clientes, add empresa_id to cotizaciones

Revision ID: d5e2f9b3c8a1
Revises: c4d1e8f2a9b5
Create Date: 2026-04-18 21:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "d5e2f9b3c8a1"
down_revision: Union[str, None] = "c4d1e8f2a9b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # empresas table
    op.create_table(
        "empresas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("razon_social", sa.String(255), nullable=True),
        sa.Column("rut", sa.String(20), nullable=True),
        sa.Column("forma_pago", sa.String(100), nullable=True),
        sa.Column("prioridad", sa.String(50), nullable=True),
        sa.Column("sector", sa.String(100), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("nota_cobranza", sa.Text(), nullable=True),
        sa.Column("ubicacion", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rut"),
    )
    # rename clientes.direccion → clientes.direccion_despacho
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("clientes") as batch_op:
            batch_op.alter_column("direccion", new_column_name="direccion_despacho")
    else:
        op.execute("ALTER TABLE clientes RENAME COLUMN direccion TO direccion_despacho")

    # extend clientes
    op.add_column("clientes", sa.Column("empresa_id", sa.Integer(), nullable=True))
    op.add_column("clientes", sa.Column("recibe_correo", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("clientes", sa.Column("forma_pago", sa.String(100), nullable=True))
    op.add_column("clientes", sa.Column("despacho_o_retiro", sa.String(20), nullable=True))
    op.add_column("clientes", sa.Column("comuna", sa.String(100), nullable=True))
    op.add_column("clientes", sa.Column("ultimo_contacto", sa.Date(), nullable=True))
    op.add_column("clientes", sa.Column("forma_captacion", sa.String(100), nullable=True))
    op.add_column("clientes", sa.Column("compromiso", sa.Text(), nullable=True))
    op.add_column("clientes", sa.Column("es_nuevo", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_clientes_empresa_id", "clientes", "empresas", ["empresa_id"], ["id"], ondelete="SET NULL"
        )

    # add empresa_id to cotizaciones
    op.add_column("cotizaciones", sa.Column("empresa_id", sa.Integer(), nullable=True))
    if bind.dialect.name != "sqlite":
        op.create_foreign_key(
            "fk_cotizaciones_empresa_id", "cotizaciones", "empresas", ["empresa_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.drop_constraint("fk_cotizaciones_empresa_id", "cotizaciones", type_="foreignkey")
        op.drop_constraint("fk_clientes_empresa_id", "clientes", type_="foreignkey")
    op.drop_column("cotizaciones", "empresa_id")

    op.drop_column("clientes", "compromiso")
    op.drop_column("clientes", "forma_captacion")
    op.drop_column("clientes", "ultimo_contacto")
    op.drop_column("clientes", "comuna")
    op.drop_column("clientes", "despacho_o_retiro")
    op.drop_column("clientes", "forma_pago")
    op.drop_column("clientes", "recibe_correo")
    op.drop_column("clientes", "es_nuevo")
    op.drop_column("clientes", "empresa_id")

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("clientes") as batch_op:
            batch_op.alter_column("direccion_despacho", new_column_name="direccion")
    else:
        op.execute("ALTER TABLE clientes RENAME COLUMN direccion_despacho TO direccion")

    op.drop_table("empresas")
