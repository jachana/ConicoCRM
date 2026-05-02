from datetime import date
from decimal import Decimal
from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PrecioEspecialCliente(Base):
    __tablename__ = "precios_especiales_cliente"
    __table_args__ = (
        UniqueConstraint("rut_entidad", "sku", name="uq_precio_especial_rut_sku"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    rut_entidad: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    precio_especial: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    descuento_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    vigencia_desde: Mapped[date | None] = mapped_column(Date, nullable=True)
    vigencia_hasta: Mapped[date | None] = mapped_column(Date, nullable=True)

    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True
    )
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )

    cliente: Mapped["Cliente | None"] = relationship("Cliente", lazy="select")
    empresa: Mapped["Empresa | None"] = relationship("Empresa", lazy="select")
    producto: Mapped["Producto | None"] = relationship("Producto", lazy="select")
