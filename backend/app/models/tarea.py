from datetime import date, datetime, timezone
from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Index,
    String, Text, text
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Tarea(Base):
    __tablename__ = "tareas"

    id: Mapped[int] = mapped_column(primary_key=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)

    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pendiente", server_default=text("'pendiente'")
    )
    motivo_descarte: Mapped[str | None] = mapped_column(String(255), nullable=True)

    origen: Mapped[str] = mapped_column(String(20), nullable=False)
    tipo_regla: Mapped[str | None] = mapped_column(String(40), nullable=True)
    dedup_key: Mapped[str | None] = mapped_column(String(100), nullable=True)

    asignado_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    creado_por_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True
    )
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True
    )
    nota_venta_id: Mapped[int | None] = mapped_column(
        ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True
    )
    factura_id: Mapped[int | None] = mapped_column(
        ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True
    )
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )

    completada_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completada_por_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    asignado: Mapped["User"] = relationship("User", foreign_keys=[asignado_id])
    creado_por: Mapped["User | None"] = relationship("User", foreign_keys=[creado_por_id])
    completada_por: Mapped["User | None"] = relationship("User", foreign_keys=[completada_por_id])
    cliente: Mapped["Cliente | None"] = relationship("Cliente")
    empresa: Mapped["Empresa | None"] = relationship("Empresa")
    cotizacion: Mapped["Cotizacion | None"] = relationship("Cotizacion")
    nota_venta: Mapped["NotaVenta | None"] = relationship("NotaVenta")
    factura: Mapped["Factura | None"] = relationship("Factura")
    producto: Mapped["Producto | None"] = relationship("Producto")

    __table_args__ = (
        CheckConstraint(
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
        Index("ix_tareas_asignado_estado_due", "asignado_id", "estado", "due_date"),
        Index(
            "ux_tareas_dedup_pendiente",
            "dedup_key",
            unique=True,
            postgresql_where=text("estado = 'pendiente' AND dedup_key IS NOT NULL"),
            sqlite_where=text("estado = 'pendiente' AND dedup_key IS NOT NULL"),
        ),
    )
