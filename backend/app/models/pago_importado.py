from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PagoImportado(Base):
    __tablename__ = "pagos_importados"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Fecha del pago
    fecha_pago: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # RUT del cliente (para matching)
    rut_cliente: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # Monto del pago
    monto: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Medio de pago (transferencia, cheque, efectivo, etc.)
    medio_pago: Mapped[str] = mapped_column(String(50), nullable=False)
    # Referencia del pago (número de transferencia, número de cheque, etc.)
    referencia: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Folio del documento (número de factura/boleta a pagar)
    folio_documento: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    # Tipo de documento (factura, boleta, etc.)
    tipo_documento: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Estado del pago (created, updated, pending, error, matched)
    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default=text("'pending'"), index=True
    )
    # Hash único para detectar duplicados (SHA256 de fecha_pago + rut_cliente + monto + referencia)
    hash_key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # ID de factura matched (si fue matched)
    factura_id: Mapped[int | None] = mapped_column(
        ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True
    )
    # ID de boleta matched (si fue matched)
    boleta_id: Mapped[int | None] = mapped_column(
        ForeignKey("boletas.id", ondelete="SET NULL"), nullable=True
    )
    # Notas/comentarios sobre el pago
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Datos brutos del origen (JSON)
    datos_origen: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
    )

    # Relationships
    factura: Mapped["Factura | None"] = relationship("Factura", foreign_keys=[factura_id])
    boleta: Mapped["Boleta | None"] = relationship("Boleta", foreign_keys=[boleta_id])
