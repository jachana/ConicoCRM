from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class FacturaCompra(Base):
    __tablename__ = "facturas_compra"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    proveedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("proveedores.id", ondelete="SET NULL"), nullable=True
    )
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    estado: Mapped[str] = mapped_column(String(20), default="emitida")
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    dte_estado: Mapped[str] = mapped_column(
        String(20), default="no_emitida", server_default=text("'no_emitida'")
    )
    xml_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("dte_estado", "no_emitida")
        kwargs.setdefault("estado", "emitida")
        super().__init__(**kwargs)

    proveedor: Mapped["Proveedor | None"] = relationship("Proveedor")
    lineas: Mapped[list["FacturaCompraLinea"]] = relationship(
        "FacturaCompraLinea",
        back_populates="factura_compra",
        cascade="all, delete-orphan",
        order_by="FacturaCompraLinea.orden",
    )

    @property
    def is_locked(self) -> bool:
        return self.dte_estado in ("pendiente", "procesando", "aceptada")


class FacturaCompraLinea(Base):
    __tablename__ = "factura_compra_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    factura_compra_id: Mapped[int] = mapped_column(
        ForeignKey("facturas_compra.id", ondelete="CASCADE")
    )
    orden: Mapped[int] = mapped_column(Integer, default=0)
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[str] = mapped_column(String(500))
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    valor_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))

    factura_compra: Mapped["FacturaCompra"] = relationship(
        "FacturaCompra", back_populates="lineas"
    )
    producto: Mapped["Producto | None"] = relationship("Producto")
