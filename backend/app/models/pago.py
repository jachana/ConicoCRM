from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Pago(Base):
    __tablename__ = "pagos"

    id: Mapped[int] = mapped_column(primary_key=True)
    factura_id: Mapped[int] = mapped_column(
        ForeignKey("facturas.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    metodo_pago: Mapped[str] = mapped_column(String(50), nullable=False)
    nota: Mapped[str | None] = mapped_column(String(500), nullable=True)
    registrado_por_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    factura: Mapped["Factura"] = relationship("Factura", back_populates="pagos")
    registrado_por: Mapped["User | None"] = relationship("User")
