from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    forma_pago: Mapped[str | None] = mapped_column(String(100), nullable=True)
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
