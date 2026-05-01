from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EstadoAlerta(str, Enum):
    PENDIENTE = "pendiente"
    COMPLETADA = "completada"
    CANCELADA = "cancelada"


class NotaAlerta(Base):
    __tablename__ = "notas_alertas"

    id: Mapped[int] = mapped_column(primary_key=True)
    cotizacion_id: Mapped[int] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="CASCADE")
    )
    contenido: Mapped[str] = mapped_column(Text)
    estado: Mapped[EstadoAlerta] = mapped_column(
        SqlEnum(EstadoAlerta, native_enum=False),
        default=EstadoAlerta.PENDIENTE,
        server_default=text("'pendiente'"),
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

    cotizacion: Mapped["Cotizacion"] = relationship("Cotizacion")
