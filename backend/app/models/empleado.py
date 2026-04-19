from datetime import datetime, date, timezone
from decimal import Decimal
from sqlalchemy import String, Boolean, Date, DateTime, Numeric, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Empleado(Base):
    __tablename__ = "empleados"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    cargo: Mapped[str] = mapped_column(String(255))
    sueldo_base: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    fecha_ingreso: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    documentos: Mapped[list["EmpleadoDocumento"]] = relationship(
        "EmpleadoDocumento", back_populates="empleado", cascade="all, delete-orphan"
    )
    vacaciones: Mapped[list["EmpleadoVacacion"]] = relationship(
        "EmpleadoVacacion", back_populates="empleado", cascade="all, delete-orphan"
    )
