from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Optional
from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EstadoAlerta(str, Enum):
    PENDIENTE = "pendiente"
    COMPLETADA = "completada"
    CANCELADA = "cancelada"


class TipoAlerta(str, Enum):
    COBRANZA = "cobranza"
    CREDITO = "crédito"
    CUSTOM = "custom"


class NotaAlerta(Base):
    __tablename__ = "notas_alertas"

    id: Mapped[int] = mapped_column(primary_key=True)
    cotizacion_id: Mapped[int] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="CASCADE")
    )
    contenido: Mapped[str] = mapped_column(Text)
    tipo: Mapped[str] = mapped_column(
        String(20),
        default="custom",
        server_default=text("'custom'"),
    )
    monto: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )
    estado: Mapped[EstadoAlerta] = mapped_column(
        SqlEnum(EstadoAlerta, native_enum=False),
        default=EstadoAlerta.PENDIENTE,
        server_default=text("'pendiente'"),
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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
