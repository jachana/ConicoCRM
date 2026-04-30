"""add solicitudes_descuento table

Revision ID: g8h9i0j1k2l3
Revises: f7g8h9i0j1k2
Create Date: 2026-04-30 21:00:00.000000

Vendor-initiated discount approval workflow. Vendor proposes line discounts
above the configurable free-discount threshold; admin/subadmin approve or
reject. While a request is pending, cotización emisión (PDF/email) is
blocked. Mirrors aprobaciones_margen but stores discount % per line.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g8h9i0j1k2l3"
down_revision: Union[str, None] = "f7g8h9i0j1k2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "solicitudes_descuento",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "cotizacion_id",
            sa.Integer,
            sa.ForeignKey("cotizaciones.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "vendedor_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "revisor_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("nota", sa.Text, nullable=True),
        sa.Column("comentario_revisor", sa.Text, nullable=True),
        sa.Column("estado", sa.String(20), nullable=False, server_default="pendiente"),
        sa.Column("lineas_propuestas", sa.Text, nullable=True),
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
    op.create_index(
        "ix_solicitudes_descuento_cotizacion_id",
        "solicitudes_descuento",
        ["cotizacion_id"],
    )
    op.create_index(
        "ix_solicitudes_descuento_estado",
        "solicitudes_descuento",
        ["estado"],
    )


def downgrade() -> None:
    op.drop_index("ix_solicitudes_descuento_estado", table_name="solicitudes_descuento")
    op.drop_index("ix_solicitudes_descuento_cotizacion_id", table_name="solicitudes_descuento")
    op.drop_table("solicitudes_descuento")
