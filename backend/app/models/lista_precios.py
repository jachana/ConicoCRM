from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ListaPrecios(Base):
    __tablename__ = "listas_precios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre_archivo: Mapped[str] = mapped_column(String(255))
    ruta_archivo: Mapped[str] = mapped_column(String(500))
    subida_por_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    fecha_subida: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    activa: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), index=True)
    total_items: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))

    subida_por: Mapped["User"] = relationship("User")
    items: Mapped[list["ListaPreciosItem"]] = relationship(
        "ListaPreciosItem", back_populates="lista", cascade="all, delete-orphan"
    )


class ListaPreciosItem(Base):
    __tablename__ = "lista_precios_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    lista_id: Mapped[int] = mapped_column(ForeignKey("listas_precios.id", ondelete="CASCADE"))
    sku: Mapped[str] = mapped_column(String(100), index=True)
    costo_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    lista: Mapped["ListaPrecios"] = relationship("ListaPrecios", back_populates="items")
