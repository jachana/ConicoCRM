from sqlalchemy import String, ForeignKey, Table, Column
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

producto_tipo_link = Table(
    "producto_tipo_link",
    Base.metadata,
    Column("producto_id", ForeignKey("productos.id", ondelete="CASCADE"), primary_key=True),
    Column("tipo_id", ForeignKey("tipos_producto.id", ondelete="CASCADE"), primary_key=True),
)


class TipoProducto(Base):
    __tablename__ = "tipos_producto"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True, index=True)
