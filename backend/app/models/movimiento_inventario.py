from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class MovimientoInventario(Base):
    __tablename__ = "movimientos_inventario"

    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id", ondelete="RESTRICT"))
    tipo: Mapped[str] = mapped_column(String(20))        # entrada | salida | ajuste
    cantidad: Mapped[int] = mapped_column(Integer)        # siempre > 0
    signo: Mapped[int] = mapped_column(Integer)           # +1 o -1
    referencia_tipo: Mapped[str | None] = mapped_column(String(30), nullable=True)
    referencia_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    motivo: Mapped[str | None] = mapped_column(String(30), nullable=True)
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    producto: Mapped["Producto"] = relationship("Producto")
    usuario: Mapped["User | None"] = relationship("User")
