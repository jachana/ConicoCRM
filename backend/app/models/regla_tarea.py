from sqlalchemy import Boolean, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ReglaTarea(Base):
    __tablename__ = "reglas_tarea"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    offset_dias: Mapped[int] = mapped_column(Integer, nullable=False)
    asignado_rol: Mapped[str] = mapped_column(String(20), nullable=False)
