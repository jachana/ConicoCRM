from datetime import datetime, date, timezone
from sqlalchemy import Integer, Date, DateTime, Text, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EmpleadoVacacion(Base):
    __tablename__ = "empleado_vacaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    empleado_id: Mapped[int] = mapped_column(ForeignKey("empleados.id", ondelete="CASCADE"))
    fecha_inicio: Mapped[date] = mapped_column(Date)
    fecha_fin: Mapped[date] = mapped_column(Date)
    dias: Mapped[int] = mapped_column(Integer)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    registrado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    empleado: Mapped["Empleado"] = relationship("Empleado", back_populates="vacaciones")
