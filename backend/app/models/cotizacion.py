from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Cotizacion(Base):
    __tablename__ = "cotizaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="RESTRICT"))
    vendedor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    estado: Mapped[str] = mapped_column(String(20), default="no_definido")
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    terminos_pago: Mapped[str | None] = mapped_column(String(255), nullable=True)
    terminos_pago_estado: Mapped[str] = mapped_column(String(20), default="aprobado")
    validez_dias: Mapped[int] = mapped_column(Integer, default=5, server_default=text("5"))
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
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

    cliente: Mapped["Cliente"] = relationship("Cliente")
    vendedor: Mapped["User"] = relationship("User")
    empresa: Mapped["Empresa | None"] = relationship("Empresa")
    lineas: Mapped[list["CotizacionLinea"]] = relationship(
        "CotizacionLinea",
        back_populates="cotizacion",
        cascade="all, delete-orphan",
        order_by="CotizacionLinea.orden",
    )

    @property
    def margen_total(self) -> "Decimal | None":
        lineas_con_margen = [l for l in self.lineas if l.margen is not None]
        if not lineas_con_margen:
            return None
        base = sum(l.total_neto for l in lineas_con_margen)
        if not base:
            return None
        return sum(l.total_neto * l.margen for l in lineas_con_margen) / base


class CotizacionLinea(Base):
    __tablename__ = "cotizacion_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    cotizacion_id: Mapped[int] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="CASCADE")
    )
    orden: Mapped[int] = mapped_column(Integer)
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[str] = mapped_column(String(500))
    formato: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    valor_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    descuento: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"), server_default=text("0"))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    margen: Mapped[Decimal | None] = mapped_column(Numeric(10, 8), nullable=True)

    cotizacion: Mapped["Cotizacion"] = relationship("Cotizacion", back_populates="lineas")
    producto: Mapped["Producto | None"] = relationship("Producto")
