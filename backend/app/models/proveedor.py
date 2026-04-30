from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Proveedor(Base):
    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    giro: Mapped[str | None] = mapped_column(String(255), nullable=True)
    direccion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    comuna: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(50), nullable=True)
    condicion_pago: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    productos: Mapped[list["Producto"]] = relationship("Producto", back_populates="proveedor")
