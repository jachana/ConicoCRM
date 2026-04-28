from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Factura(Base):
    __tablename__ = "facturas"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True
    )
    nv_id: Mapped[int | None] = mapped_column(
        ForeignKey("nota_ventas.id", ondelete="SET NULL"), nullable=True
    )
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True)
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    banco_receptor_id: Mapped[int | None] = mapped_column(
        ForeignKey("banco_receptores.id", ondelete="SET NULL"), nullable=True
    )
    vendedor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    contacto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="emitida")
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    fecha_pago: Mapped[date | None] = mapped_column(Date, nullable=True)
    monto_pagado: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    metodo_pago: Mapped[str | None] = mapped_column(String(50), nullable=True)
    plazo_dias: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    origen: Mapped[str] = mapped_column(String(10), default="manual", server_default=text("manual"))
    dte_estado: Mapped[str] = mapped_column(String(20), default="no_emitida", server_default=text("'no_emitida'"))
    xml_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    ultimo_recordatorio: Mapped[date | None] = mapped_column(Date, nullable=True)
    referencias_docs: Mapped[list | None] = mapped_column(JSON, default=list)
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
    banco_receptor: Mapped["BancoReceptor | None"] = relationship("BancoReceptor")
    vendedor: Mapped["User | None"] = relationship("User")
    cotizacion: Mapped["Cotizacion | None"] = relationship("Cotizacion")
    nv: Mapped["NotaVenta | None"] = relationship("NotaVenta", back_populates="factura")
    lineas: Mapped[list["FacturaLinea"]] = relationship(
        "FacturaLinea",
        back_populates="factura",
        cascade="all, delete-orphan",
        order_by="FacturaLinea.orden",
    )
    pagos: Mapped[list["Pago"]] = relationship(
        "Pago",
        back_populates="factura",
        order_by="Pago.fecha",
    )

    @property
    def margen_total(self) -> "Decimal | None":
        lineas_con_margen = [l for l in self.lineas if l.margen is not None]
        if not lineas_con_margen:
            return None
        base = sum(l.total_neto for l in lineas_con_margen)
        if not base:
            return None
        return sum(l.total_neto * l.margen for l in lineas_con_margen) / base

    @property
    def is_locked(self) -> bool:
        return self.estado not in ("emitida", "parcial")


class FacturaLinea(Base):
    __tablename__ = "factura_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    factura_id: Mapped[int] = mapped_column(ForeignKey("facturas.id", ondelete="CASCADE"))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    descripcion: Mapped[str] = mapped_column(String(500))
    formato: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    valor_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    margen: Mapped[Decimal | None] = mapped_column(Numeric(10, 8), nullable=True)

    factura: Mapped["Factura"] = relationship("Factura", back_populates="lineas")
    producto: Mapped["Producto | None"] = relationship("Producto")
