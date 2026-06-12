from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class NotaDebito(Base):
    __tablename__ = "notas_debito"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id", ondelete="RESTRICT"))
    factura_id: Mapped[int | None] = mapped_column(
        ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True, index=True
    )
    razon: Mapped[str] = mapped_column(String(500))
    monto_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    monto_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    monto_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    dte_estado: Mapped[str] = mapped_column(String(20), default="no_emitida", server_default=text("'no_emitida'"))
    historico: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("dte_estado", "no_emitida")
        super().__init__(**kwargs)

    cliente: Mapped["Cliente"] = relationship("Cliente")
    lineas: Mapped[list["NotaDebitoLinea"]] = relationship(
        "NotaDebitoLinea",
        back_populates="nota_debito",
        cascade="all, delete-orphan",
        order_by="NotaDebitoLinea.orden",
    )
    emision: Mapped["DteEmision | None"] = relationship(
        "DteEmision",
        primaryjoin="DteEmision.nota_debito_id == NotaDebito.id",
        foreign_keys="DteEmision.nota_debito_id",
        uselist=False,
    )


class NotaDebitoLinea(Base):
    __tablename__ = "nota_debito_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nota_debito_id: Mapped[int] = mapped_column(ForeignKey("notas_debito.id", ondelete="CASCADE"))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    descripcion: Mapped[str] = mapped_column(String(500))
    cantidad: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1"))
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))

    nota_debito: Mapped["NotaDebito"] = relationship("NotaDebito", back_populates="lineas")
