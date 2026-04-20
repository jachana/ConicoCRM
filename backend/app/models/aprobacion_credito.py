from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class AprobacionCredito(Base):
    __tablename__ = "aprobaciones_credito"

    id: Mapped[int] = mapped_column(primary_key=True)
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    origen: Mapped[str] = mapped_column(String(20))
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True
    )
    nv_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    nv_id: Mapped[int | None] = mapped_column(
        ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True
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

    vendedor: Mapped["User | None"] = relationship("User", foreign_keys=[vendedor_id])
    empresa: Mapped["Empresa | None"] = relationship("Empresa")
