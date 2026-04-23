from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Text, DateTime, Numeric, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    forma_pago: Mapped[str | None] = mapped_column(String(100), nullable=True)
    linea_credito: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    limite_credito: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    plazo_credito: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prioridad: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nota_cobranza: Mapped[str | None] = mapped_column(Text, nullable=True)
    ubicacion: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    clientes: Mapped[list["Cliente"]] = relationship("Cliente", back_populates="empresa")
    sedes_despacho: Mapped[list["SedeDespacho"]] = relationship(
        "SedeDespacho", back_populates="empresa", cascade="all, delete-orphan"
    )
