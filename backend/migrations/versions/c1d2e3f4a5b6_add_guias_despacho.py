"""add_guias_despacho

Revision ID: c1d2e3f4a5b6
Revises: b7c8d9e0f1g2
Create Date: 2026-04-26

W1-05: tablas guias_despacho + guia_despacho_lineas, FK guia_despacho_id en
dte_emisiones (drop+recreate ck_dte_emision_one_document con 5 FKs) y notas_credito,
seed system_config('guia_despacho_last_id', '0').

Reversible — guías y NCs vinculadas se pierden si downgrade tras emisión real.
"""
from alembic import op
import sqlalchemy as sa


revision = "c1d2e3f4a5b6"
down_revision = "b7c8d9e0f1g2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) guias_despacho
    op.create_table(
        "guias_despacho",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("motivo_traslado", sa.Integer(), nullable=False),
        sa.Column("direccion_destino", sa.String(255), nullable=True),
        sa.Column("comuna_destino", sa.String(100), nullable=True),
        sa.Column("cliente_id", sa.Integer(), sa.ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nota_venta_id", sa.Integer(), sa.ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email_envio", sa.String(255), nullable=True),
        sa.Column("vendedor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("estado", sa.String(20), nullable=False, server_default="emitida"),
        sa.Column("dte_estado", sa.String(20), nullable=False, server_default="no_emitida"),
        sa.Column("xml_raw", sa.Text(), nullable=True),
        sa.Column("track_id", sa.String(100), nullable=True),
        sa.Column("folio_sii", sa.Integer(), nullable=True),
        sa.Column("email_enviado_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_guias_despacho_numero", "guias_despacho", ["numero"], unique=True)
    op.create_index("ix_guias_despacho_fecha", "guias_despacho", ["fecha"])
    op.create_index("ix_guias_despacho_cliente_id", "guias_despacho", ["cliente_id"])
    op.create_index("ix_guias_despacho_dte_estado", "guias_despacho", ["dte_estado"])
    op.create_index("ix_guias_despacho_track_id", "guias_despacho", ["track_id"])

    # 2) guia_despacho_lineas
    op.create_table(
        "guia_despacho_lineas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("guia_despacho_id", sa.Integer(), sa.ForeignKey("guias_despacho.id", ondelete="CASCADE"), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("producto_id", sa.Integer(), sa.ForeignKey("productos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("descripcion", sa.String(500), nullable=False),
        sa.Column("cantidad", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("precio_unitario", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("descuento_pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("exenta", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("total_neto", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("iva", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_linea", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.create_index("ix_guia_despacho_lineas_guia_id", "guia_despacho_lineas", ["guia_despacho_id"])

    bind = op.get_bind()

    # 3) FK + check constraint en dte_emisiones (5 FKs)
    if bind.dialect.name == "postgresql":
        op.add_column("dte_emisiones", sa.Column("guia_despacho_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_dte_emisiones_guia_despacho_id", "dte_emisiones", "guias_despacho",
            ["guia_despacho_id"], ["id"], ondelete="CASCADE",
        )
        op.create_index("ix_dte_emisiones_guia_despacho_id", "dte_emisiones", ["guia_despacho_id"])
        result = bind.execute(sa.text(
            "SELECT 1 FROM pg_constraint WHERE conname = 'ck_dte_emision_one_document'"
        )).fetchone()
        if result:
            op.drop_constraint("ck_dte_emision_one_document", "dte_emisiones", type_="check")
        op.create_check_constraint(
            "ck_dte_emision_one_document",
            "dte_emisiones",
            "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN guia_despacho_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
        )
    else:
        with op.batch_alter_table("dte_emisiones") as batch_op:
            batch_op.add_column(sa.Column("guia_despacho_id", sa.Integer(), nullable=True))

    # 4) FK en notas_credito
    if bind.dialect.name == "postgresql":
        op.add_column("notas_credito", sa.Column("guia_despacho_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_notas_credito_guia_despacho_id", "notas_credito", "guias_despacho",
            ["guia_despacho_id"], ["id"], ondelete="SET NULL",
        )
        op.create_index("ix_notas_credito_guia_despacho_id", "notas_credito", ["guia_despacho_id"])
    else:
        with op.batch_alter_table("notas_credito") as batch_op:
            batch_op.add_column(sa.Column("guia_despacho_id", sa.Integer(), nullable=True))

    # 5) seed system_config
    if bind.dialect.name == "postgresql":
        op.execute(
            "INSERT INTO system_config (key, value) VALUES ('guia_despacho_last_id', '0') "
            "ON CONFLICT (key) DO NOTHING"
        )
    else:
        op.execute(
            "INSERT OR IGNORE INTO system_config (key, value) VALUES ('guia_despacho_last_id', '0')"
        )


def downgrade() -> None:
    bind = op.get_bind()

    op.execute("DELETE FROM system_config WHERE key = 'guia_despacho_last_id'")

    if bind.dialect.name == "postgresql":
        op.drop_index("ix_notas_credito_guia_despacho_id", table_name="notas_credito")
        op.drop_constraint("fk_notas_credito_guia_despacho_id", "notas_credito", type_="foreignkey")
        op.drop_column("notas_credito", "guia_despacho_id")

        op.drop_constraint("ck_dte_emision_one_document", "dte_emisiones", type_="check")
        op.create_check_constraint(
            "ck_dte_emision_one_document",
            "dte_emisiones",
            "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
        )
        op.drop_index("ix_dte_emisiones_guia_despacho_id", table_name="dte_emisiones")
        op.drop_constraint("fk_dte_emisiones_guia_despacho_id", "dte_emisiones", type_="foreignkey")
        op.drop_column("dte_emisiones", "guia_despacho_id")
    else:
        with op.batch_alter_table("notas_credito") as batch_op:
            batch_op.drop_column("guia_despacho_id")
        with op.batch_alter_table("dte_emisiones") as batch_op:
            batch_op.drop_column("guia_despacho_id")

    op.drop_index("ix_guia_despacho_lineas_guia_id", table_name="guia_despacho_lineas")
    op.drop_table("guia_despacho_lineas")

    op.drop_index("ix_guias_despacho_track_id", table_name="guias_despacho")
    op.drop_index("ix_guias_despacho_dte_estado", table_name="guias_despacho")
    op.drop_index("ix_guias_despacho_cliente_id", table_name="guias_despacho")
    op.drop_index("ix_guias_despacho_fecha", table_name="guias_despacho")
    op.drop_index("ix_guias_despacho_numero", table_name="guias_despacho")
    op.drop_table("guias_despacho")
