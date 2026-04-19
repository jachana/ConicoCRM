from datetime import datetime, date, timezone
from sqlalchemy import String, Text, DateTime, Date, Boolean, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(50), nullable=True)
    direccion_despacho: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    recibe_correo: Mapped[bool] = mapped_column(Boolean, default=True)
    forma_pago: Mapped[str | None] = mapped_column(String(100), nullable=True)
    despacho_o_retiro: Mapped[str | None] = mapped_column(String(20), nullable=True)
    comuna: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ultimo_contacto: Mapped[date | None] = mapped_column(Date, nullable=True)
    forma_captacion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    compromiso: Mapped[str | None] = mapped_column(Text, nullable=True)
    es_nuevo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    empresa: Mapped["Empresa | None"] = relationship("Empresa", back_populates="clientes")
