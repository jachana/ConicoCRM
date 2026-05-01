from datetime import datetime, timezone
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, text, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class LibroVentas(Base):
    __tablename__ = "libros_ventas"
    __table_args__ = (
        UniqueConstraint("empresa_id", "periodo", name="uq_libro_ventas_empresa_periodo"),
        Index("ix_libro_ventas_empresa_id", "empresa_id"),
        Index("ix_libro_ventas_estado", "estado"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    periodo: Mapped[str] = mapped_column(String(7))  # YYYY-MM format
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id", ondelete="CASCADE"))
    folio_inicio: Mapped[int | None] = mapped_column(Integer, nullable=True)
    folio_fin: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_registros: Mapped[int] = mapped_column(Integer, default=0)
    monto_total: Mapped[int] = mapped_column(Integer, default=0)
    estado: Mapped[str] = mapped_column(String(20), default="borrador")  # borrador, enviado
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("estado", "borrador")
        kwargs.setdefault("total_registros", 0)
        kwargs.setdefault("monto_total", 0)
        super().__init__(**kwargs)


class LibroCompras(Base):
    __tablename__ = "libros_compras"
    __table_args__ = (
        UniqueConstraint("empresa_id", "periodo", name="uq_libro_compras_empresa_periodo"),
        Index("ix_libro_compras_empresa_id", "empresa_id"),
        Index("ix_libro_compras_estado", "estado"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    periodo: Mapped[str] = mapped_column(String(7))  # YYYY-MM format
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id", ondelete="CASCADE"))
    rut_proveedor: Mapped[str | None] = mapped_column(String(20), nullable=True)
    total_registros: Mapped[int] = mapped_column(Integer, default=0)
    monto_total: Mapped[int] = mapped_column(Integer, default=0)
    estado: Mapped[str] = mapped_column(String(20), default="borrador")  # borrador, enviado
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("estado", "borrador")
        kwargs.setdefault("total_registros", 0)
        kwargs.setdefault("monto_total", 0)
        super().__init__(**kwargs)


class DteRecepcion(Base):
    __tablename__ = "dte_recepciones"
    __table_args__ = (
        Index("ix_dte_recepciones_empresa_id", "empresa_id"),
        Index("ix_dte_recepciones_estado", "estado"),
        Index("ix_dte_recepciones_empresa_estado", "empresa_id", "estado"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id", ondelete="CASCADE"))
    tipo: Mapped[str] = mapped_column(String(3))  # e.g. '46' for libro de recepción
    folio: Mapped[int] = mapped_column(Integer)
    rut_emisor: Mapped[str] = mapped_column(String(20))
    monto: Mapped[int] = mapped_column(Integer)
    xml_raw: Mapped[str | None] = mapped_column(String, nullable=True)  # Use String for large text
    estado: Mapped[str] = mapped_column(String(20), default="recibido")  # recibido, aceptado, rechazado
    respuesta_sii: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    rechazo_motivo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("estado", "recibido")
        super().__init__(**kwargs)
