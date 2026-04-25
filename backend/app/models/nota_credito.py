from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class NotaCredito(Base):
    __tablename__ = "notas_credito"

    id: Mapped[int] = mapped_column(primary_key=True)
    numero: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=True
    )
    boleta_id: Mapped[int | None] = mapped_column(
        ForeignKey("boletas.id", ondelete="SET NULL"), nullable=True
    )
    razon: Mapped[str] = mapped_column(String(500))
    monto_neto: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    monto_iva: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    monto_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    dte_estado: Mapped[str] = mapped_column(String(20), default="no_emitida", server_default=text("'no_emitida'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("dte_estado", "no_emitida")
        super().__init__(**kwargs)

    cliente: Mapped["Cliente | None"] = relationship("Cliente")
    lineas: Mapped[list["NotaCreditoLinea"]] = relationship(
        "NotaCreditoLinea",
        back_populates="nota_credito",
        cascade="all, delete-orphan",
        order_by="NotaCreditoLinea.orden",
    )
    emision: Mapped["DteEmision | None"] = relationship(
        "DteEmision",
        primaryjoin="DteEmision.nota_credito_id == NotaCredito.id",
        foreign_keys="DteEmision.nota_credito_id",
        uselist=False,
    )


class NotaCreditoLinea(Base):
    __tablename__ = "nota_credito_lineas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nota_credito_id: Mapped[int] = mapped_column(ForeignKey("notas_credito.id", ondelete="CASCADE"))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    descripcion: Mapped[str] = mapped_column(String(500))
    cantidad: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1"))
    precio_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))

    nota_credito: Mapped["NotaCredito"] = relationship("NotaCredito", back_populates="lineas")
