from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Boleta(Base):
    __tablename__ = "boletas"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    tipo_dte: Mapped[str] = mapped_column(String(2))  # '39' afecta | '41' exenta
    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True
    )
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    patente_vehiculo: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    email_envio: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nombre_receptor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rut_receptor: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    metodo_pago: Mapped[str] = mapped_column(String(20), default="efectivo", server_default=text("'efectivo'"))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    monto_pagado: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    estado: Mapped[str] = mapped_column(String(20), default="emitida", server_default=text("'emitida'"))
    dte_estado: Mapped[str] = mapped_column(String(20), default="no_emitida", server_default=text("'no_emitida'"))
    xml_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    track_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    folio_sii: Mapped[int | None] = mapped_column(Integer, nullable=True)
    email_enviado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    cliente: Mapped["Cliente | None"] = relationship("Cliente")
    empresa: Mapped["Empresa | None"] = relationship("Empresa")
    vendedor: Mapped["User | None"] = relationship("User")
    lineas: Mapped[list["BoletaLinea"]] = relationship(
        "BoletaLinea",
        back_populates="boleta",
        cascade="all, delete-orphan",
        order_by="BoletaLinea.orden",
    )
    emision: Mapped["DteEmision | None"] = relationship(
        "DteEmision",
        primaryjoin="DteEmision.boleta_id == Boleta.id",
        foreign_keys="DteEmision.boleta_id",
        uselist=False,
    )

    @property
    def is_locked(self) -> bool:
        return self.estado != "emitida"


class BoletaLinea(Base):
    __tablename__ = "boleta_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    boleta_id: Mapped[int] = mapped_column(ForeignKey("boletas.id", ondelete="CASCADE"))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )
    descripcion: Mapped[str] = mapped_column(String(500))
    cantidad: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1"))
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    descuento_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    exenta: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_linea: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))

    boleta: Mapped["Boleta"] = relationship("Boleta", back_populates="lineas")
    producto: Mapped["Producto | None"] = relationship("Producto")
