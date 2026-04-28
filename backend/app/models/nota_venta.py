from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class NotaVenta(Base):
    __tablename__ = "nota_ventas"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True
    )
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="RESTRICT"))
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    sede_despacho_id: Mapped[int | None] = mapped_column(
        ForeignKey("sedes_despacho.id", ondelete="SET NULL"), nullable=True
    )
    retiro_en_conico: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    terminos_pago: Mapped[str | None] = mapped_column(String(255), nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
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
    empresa: Mapped["Empresa | None"] = relationship("Empresa")
    vendedor: Mapped["User | None"] = relationship("User")
    cotizacion: Mapped["Cotizacion | None"] = relationship("Cotizacion", back_populates="nota_venta")
    lineas: Mapped[list["NotaVentaLinea"]] = relationship(
        "NotaVentaLinea",
        back_populates="nv",
        cascade="all, delete-orphan",
        order_by="NotaVentaLinea.orden",
    )
    factura: Mapped["Factura | None"] = relationship(
        "Factura", back_populates="nv", uselist=False
    )
    sede_despacho: Mapped["SedeDespacho | None"] = relationship("SedeDespacho")

    @property
    def factura_id(self) -> int | None:
        return self.factura.id if self.factura else None


class NotaVentaLinea(Base):
    __tablename__ = "nota_venta_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nv_id: Mapped[int] = mapped_column(ForeignKey("nota_ventas.id", ondelete="CASCADE"))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[str] = mapped_column(String(500))
    formato: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    valor_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    margen: Mapped[Decimal | None] = mapped_column(Numeric(10, 8), nullable=True)

    nv: Mapped["NotaVenta"] = relationship("NotaVenta", back_populates="lineas")
    producto: Mapped["Producto | None"] = relationship("Producto")
