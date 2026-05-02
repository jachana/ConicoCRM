from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class OrdenCompra(Base):
    __tablename__ = "ordenes_compra"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id", ondelete="RESTRICT"))
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    fecha_entrega_esperada: Mapped[date | None] = mapped_column(Date, nullable=True)
    estado: Mapped[str] = mapped_column(String(30), default="borrador")
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    historico: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
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

    proveedor: Mapped["Proveedor"] = relationship("Proveedor")
    lineas: Mapped[list["OrdenCompraLinea"]] = relationship(
        "OrdenCompraLinea",
        back_populates="orden_compra",
        cascade="all, delete-orphan",
        order_by="OrdenCompraLinea.orden",
    )


class OrdenCompraLinea(Base):
    __tablename__ = "orden_compra_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    orden_compra_id: Mapped[int] = mapped_column(
        ForeignKey("ordenes_compra.id", ondelete="CASCADE")
    )
    orden: Mapped[int] = mapped_column(Integer)
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[str] = mapped_column(String(500))
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    cantidad_recibida: Mapped[int] = mapped_column(Integer, default=0)
    valor_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))

    orden_compra: Mapped["OrdenCompra"] = relationship("OrdenCompra", back_populates="lineas")
    producto: Mapped["Producto | None"] = relationship("Producto")
