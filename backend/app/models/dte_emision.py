from datetime import datetime, timezone
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, text, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class DteEmision(Base):
    __tablename__ = "dte_emisiones"
    __table_args__ = (
        CheckConstraint(
            "(CASE WHEN factura_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_credito_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN nota_debito_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN boleta_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN guia_despacho_id IS NOT NULL THEN 1 ELSE 0 END) + "
            "(CASE WHEN factura_compra_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_dte_emision_one_document",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(3))  # "033", "061", "056"
    folio: Mapped[int | None] = mapped_column(Integer, nullable=True)
    track_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    factura_id: Mapped[int | None] = mapped_column(
        ForeignKey("facturas.id", ondelete="CASCADE"), nullable=True
    )
    nota_credito_id: Mapped[int | None] = mapped_column(
        ForeignKey("notas_credito.id", ondelete="CASCADE"), nullable=True
    )
    nota_debito_id: Mapped[int | None] = mapped_column(
        ForeignKey("notas_debito.id", ondelete="CASCADE"), nullable=True
    )
    boleta_id: Mapped[int | None] = mapped_column(
        ForeignKey("boletas.id", ondelete="CASCADE"), nullable=True
    )
    guia_despacho_id: Mapped[int | None] = mapped_column(
        ForeignKey("guias_despacho.id", ondelete="CASCADE"), nullable=True, index=True
    )
    factura_compra_id: Mapped[int | None] = mapped_column(
        ForeignKey("facturas_compra.id", ondelete="CASCADE"), nullable=True
    )
    monto_neto: Mapped[int] = mapped_column(Integer)
    monto_iva: Mapped[int] = mapped_column(Integer)
    monto_total: Mapped[int] = mapped_column(Integer)
    respuesta_sii: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    intentos_poll: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    emitido_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    aceptado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("estado", "pendiente")
        kwargs.setdefault("intentos_poll", 0)
        super().__init__(**kwargs)
