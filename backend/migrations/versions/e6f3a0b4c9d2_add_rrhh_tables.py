"""add empleados, empleado_documentos, empleado_vacaciones tables

Revision ID: e6f3a0b4c9d2
Revises: d5e2f9b3c8a1
Create Date: 2026-04-18 23:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e6f3a0b4c9d2"
down_revision: Union[str, None] = "d5e2f9b3c8a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "empleados",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("cargo", sa.String(255), nullable=False),
        sa.Column("sueldo_base", sa.Numeric(10, 2), nullable=True),
        sa.Column("fecha_ingreso", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "empleado_documentos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empleado_id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("ruta", sa.String(500), nullable=False),
        sa.Column("subido_en", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("subido_por_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["empleado_id"], ["empleados.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subido_por_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "empleado_vacaciones",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empleado_id", sa.Integer(), nullable=False),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_fin", sa.Date(), nullable=False),
        sa.Column("dias", sa.Integer(), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("registrado_en", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["empleado_id"], ["empleados.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("empleado_vacaciones")
    op.drop_table("empleado_documentos")
    op.drop_table("empleados")
