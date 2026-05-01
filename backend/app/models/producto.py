from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import String, Text, Numeric, Integer, ForeignKey, DateTime, text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Producto(Base):
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255), index=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    precio_costo: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    precio_venta: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    stock_minimo: Mapped[int] = mapped_column(Integer, default=0)
    stock_actual: Mapped[int] = mapped_column(Integer, default=0)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    formato: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unidad: Mapped[str | None] = mapped_column(String(50), nullable=True)
    iva_porcentaje: Mapped[int] = mapped_column(Integer, default=19)
    proveedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("proveedores.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    marca_id: Mapped[int | None] = mapped_column(
        ForeignKey("marcas.id", ondelete="SET NULL"), nullable=True
    )
    volumen: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    precio_costo_actualizado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    specs: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    proveedor: Mapped["Proveedor | None"] = relationship("Proveedor", back_populates="productos")
    marca: Mapped["Marca | None"] = relationship("Marca")
    tags: Mapped[list["ProductoTag"]] = relationship(
        "ProductoTag",
        secondary="producto_tag_link",
        lazy="selectin",
    )
    tipos: Mapped[list["TipoProducto"]] = relationship(
        "TipoProducto",
        secondary="producto_tipo_link",
        lazy="selectin",
    )
    documentos: Mapped[list["ProductoDocumento"]] = relationship(
        "ProductoDocumento", back_populates="producto", cascade="all, delete-orphan"
    )

    @property
    def precio_con_iva(self) -> Decimal:
        return (self.precio_venta * Decimal("1.19")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def costo_con_iva(self) -> Decimal:
        return (self.precio_costo * Decimal("1.19")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
