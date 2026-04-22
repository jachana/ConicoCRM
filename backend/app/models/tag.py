from sqlalchemy import String, ForeignKey, Table, Column
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

producto_tag_link = Table(
    "producto_tag_link",
    Base.metadata,
    Column("producto_id", ForeignKey("productos.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("producto_tags.id", ondelete="CASCADE"), primary_key=True),
)


class ProductoTag(Base):
    __tablename__ = "producto_tags"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True, index=True)
