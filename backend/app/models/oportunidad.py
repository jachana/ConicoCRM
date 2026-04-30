from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OportunidadEtapa(Base):
    __tablename__ = "oportunidad_etapas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#6366f1")
    is_terminal_won: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    is_terminal_lost: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    oportunidades: Mapped[list["Oportunidad"]] = relationship(
        "Oportunidad", back_populates="etapa"
    )


class Oportunidad(Base):
    __tablename__ = "oportunidades"

    id: Mapped[int] = mapped_column(primary_key=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True
    )
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    etapa_id: Mapped[int] = mapped_column(
        ForeignKey("oportunidad_etapas.id", ondelete="RESTRICT"), nullable=False
    )

    monto_estimado: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    probabilidad: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    fecha_cierre_estimada: Mapped[date | None] = mapped_column(Date, nullable=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)

    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True, unique=True
    )

    won_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lost_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_perdida: Mapped[str | None] = mapped_column(String(500), nullable=True)

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

    etapa: Mapped["OportunidadEtapa"] = relationship(
        "OportunidadEtapa", back_populates="oportunidades"
    )
    cliente = relationship("Cliente")
    empresa = relationship("Empresa")
    vendedor = relationship("User")
    cotizacion = relationship("Cotizacion")

    __table_args__ = (
        Index("ix_oportunidades_etapa_id", "etapa_id"),
        Index("ix_oportunidades_vendedor_id", "vendedor_id"),
        Index("ix_oportunidades_empresa_id", "empresa_id"),
        Index("ix_oportunidades_cliente_id", "cliente_id"),
    )


DEFAULT_ETAPAS: list[dict] = [
    {"nombre": "Lead", "orden": 10, "color": "#94a3b8", "is_terminal_won": False, "is_terminal_lost": False},
    {"nombre": "Calificada", "orden": 20, "color": "#38bdf8", "is_terminal_won": False, "is_terminal_lost": False},
    {"nombre": "Propuesta", "orden": 30, "color": "#a78bfa", "is_terminal_won": False, "is_terminal_lost": False},
    {"nombre": "Negociación", "orden": 40, "color": "#f59e0b", "is_terminal_won": False, "is_terminal_lost": False},
    {"nombre": "Ganada", "orden": 50, "color": "#22c55e", "is_terminal_won": True, "is_terminal_lost": False},
    {"nombre": "Perdida", "orden": 60, "color": "#ef4444", "is_terminal_won": False, "is_terminal_lost": True},
]
