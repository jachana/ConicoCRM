"""add oportunidades + oportunidad_etapas tables (Tier A #6 Pipeline)

Revision ID: f7g8h9i0j1k2
Revises: e6f7a8b9c0d1
Create Date: 2026-04-30 19:30:00.000000

Adds the configurable sales pipeline:
  - oportunidad_etapas: customizable kanban columns (default seed: Lead,
    Calificada, Propuesta, Negociación, Ganada, Perdida)
  - oportunidades: deals tracked across stages, optionally convertible to a
    cotización when reaching a terminal-won stage
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f7g8h9i0j1k2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DEFAULT_ETAPAS = [
    ("Lead", 10, "#94a3b8", False, False),
    ("Calificada", 20, "#38bdf8", False, False),
    ("Propuesta", 30, "#a78bfa", False, False),
    ("Negociación", 40, "#f59e0b", False, False),
    ("Ganada", 50, "#22c55e", True, False),
    ("Perdida", 60, "#ef4444", False, True),
]


def upgrade() -> None:
    etapas = op.create_table(
        "oportunidad_etapas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(length=100), nullable=False, unique=True),
        sa.Column("orden", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "color",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'#6366f1'"),
        ),
        sa.Column(
            "is_terminal_won",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_terminal_lost",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    op.bulk_insert(
        etapas,
        [
            {
                "nombre": n,
                "orden": o,
                "color": c,
                "is_terminal_won": w,
                "is_terminal_lost": l,
                "is_active": True,
            }
            for (n, o, c, w, l) in _DEFAULT_ETAPAS
        ],
    )

    op.create_table(
        "oportunidades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("titulo", sa.String(length=255), nullable=False),
        sa.Column(
            "cliente_id",
            sa.Integer(),
            sa.ForeignKey("clientes.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "empresa_id",
            sa.Integer(),
            sa.ForeignKey("empresas.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "vendedor_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "etapa_id",
            sa.Integer(),
            sa.ForeignKey("oportunidad_etapas.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "monto_estimado",
            sa.Numeric(14, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "probabilidad",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("fecha_cierre_estimada", sa.Date(), nullable=True),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column(
            "cotizacion_id",
            sa.Integer(),
            sa.ForeignKey("cotizaciones.id", ondelete="SET NULL"),
            nullable=True,
            unique=True,
        ),
        sa.Column("won_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lost_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_perdida", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_oportunidades_etapa_id", "oportunidades", ["etapa_id"])
    op.create_index("ix_oportunidades_vendedor_id", "oportunidades", ["vendedor_id"])
    op.create_index("ix_oportunidades_empresa_id", "oportunidades", ["empresa_id"])
    op.create_index("ix_oportunidades_cliente_id", "oportunidades", ["cliente_id"])


def downgrade() -> None:
    op.drop_index("ix_oportunidades_cliente_id", table_name="oportunidades")
    op.drop_index("ix_oportunidades_empresa_id", table_name="oportunidades")
    op.drop_index("ix_oportunidades_vendedor_id", table_name="oportunidades")
    op.drop_index("ix_oportunidades_etapa_id", table_name="oportunidades")
    op.drop_table("oportunidades")
    op.drop_table("oportunidad_etapas")
