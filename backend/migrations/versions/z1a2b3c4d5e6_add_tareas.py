# backend/migrations/versions/z1a2b3c4d5e6_add_tareas.py
"""add tareas y reglas_tarea

Revision ID: z1a2b3c4d5e6
Revises: 5e920d5d1874
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "z1a2b3c4d5e6"
down_revision = "5e920d5d1874"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "reglas_tarea",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tipo", sa.String(40), unique=True, nullable=False),
        sa.Column("activa", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("offset_dias", sa.Integer, nullable=False),
        sa.Column("asignado_rol", sa.String(20), nullable=False),
    )

    op.create_table(
        "tareas",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("titulo", sa.String(255), nullable=False),
        sa.Column("descripcion", sa.Text, nullable=True),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default=sa.text("'pendiente'")),
        sa.Column("motivo_descarte", sa.String(255), nullable=True),
        sa.Column("origen", sa.String(20), nullable=False),
        sa.Column("tipo_regla", sa.String(40), nullable=True),
        sa.Column("dedup_key", sa.String(100), nullable=True),
        sa.Column("asignado_id", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("creado_por_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cliente_id", sa.Integer, sa.ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("empresa_id", sa.Integer, sa.ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cotizacion_id", sa.Integer, sa.ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nota_venta_id", sa.Integer, sa.ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("factura_id", sa.Integer, sa.ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("producto_id", sa.Integer, sa.ForeignKey("productos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("completada_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completada_por_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint(
            "("
            "(CASE WHEN cliente_id IS NULL THEN 0 ELSE 1 END) + "
            "(CASE WHEN empresa_id IS NULL THEN 0 ELSE 1 END) + "
            "(CASE WHEN cotizacion_id IS NULL THEN 0 ELSE 1 END) + "
            "(CASE WHEN nota_venta_id IS NULL THEN 0 ELSE 1 END) + "
            "(CASE WHEN factura_id IS NULL THEN 0 ELSE 1 END) + "
            "(CASE WHEN producto_id IS NULL THEN 0 ELSE 1 END)"
            ") <= 1",
            name="ck_tareas_max_una_entidad",
        ),
    )

    op.create_index(
        "ix_tareas_asignado_estado_due", "tareas",
        ["asignado_id", "estado", "due_date"],
    )
    op.create_index(
        "ux_tareas_dedup_pendiente", "tareas",
        ["dedup_key"],
        unique=True,
        postgresql_where=sa.text("estado = 'pendiente' AND dedup_key IS NOT NULL"),
    )

    op.execute("""
        INSERT INTO reglas_tarea (tipo, activa, offset_dias, asignado_rol) VALUES
        ('cotizacion_vence', true, 2, 'owner'),
        ('factura_vencida', true, 1, 'owner'),
        ('aprobacion_pendiente', true, 1, 'admin'),
        ('nv_despachada_sin_avanzar', true, 3, 'owner'),
        ('cliente_sin_actividad', true, 30, 'owner'),
        ('stock_bajo_minimo', true, 0, 'admin')
    """)


def downgrade():
    op.drop_index("ux_tareas_dedup_pendiente", table_name="tareas")
    op.drop_index("ix_tareas_asignado_estado_due", table_name="tareas")
    op.drop_table("tareas")
    op.drop_table("reglas_tarea")
