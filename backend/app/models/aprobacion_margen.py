from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class AprobacionMargen(Base):
    __tablename__ = "aprobaciones_margen"

    id: Mapped[int] = mapped_column(primary_key=True)
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="CASCADE"), nullable=True
    )
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    lineas_propuestas: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
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
    cotizacion: Mapped["Cotizacion | None"] = relationship("Cotizacion", foreign_keys=[cotizacion_id])
