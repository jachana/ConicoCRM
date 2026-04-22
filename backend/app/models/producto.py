from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, Integer, ForeignKey, DateTime, text
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
    proveedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("proveedores.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    proveedor: Mapped["Proveedor | None"] = relationship("Proveedor", back_populates="productos")
    tags: Mapped[list["ProductoTag"]] = relationship(
        "ProductoTag",
        secondary="producto_tag_link",
        lazy="selectin",
    )
