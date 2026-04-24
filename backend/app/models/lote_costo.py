from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class LoteCosto(Base):
    __tablename__ = "lotes_costo"

    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id", ondelete="RESTRICT"))
    oc_linea_id: Mapped[int | None] = mapped_column(
        ForeignKey("orden_compra_lineas.id", ondelete="SET NULL"), nullable=True
    )
    costo_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    cantidad_inicial: Mapped[int] = mapped_column(Integer)
    cantidad_restante: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        index=True,
    )

    producto: Mapped["Producto"] = relationship("Producto")
