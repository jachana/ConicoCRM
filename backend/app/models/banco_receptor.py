from sqlalchemy import String, Boolean, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class BancoReceptor(Base):
    __tablename__ = "banco_receptores"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(200), unique=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("1"))
