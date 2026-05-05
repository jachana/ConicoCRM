from datetime import datetime, timezone, date
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, CheckConstraint, text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class CAF(Base):
    __tablename__ = "cafs"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(
        ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo_dte: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    num_inicio: Mapped[int] = mapped_column(Integer, nullable=False)
    num_fin: Mapped[int] = mapped_column(Integer, nullable=False)
    archivo_xml: Mapped[str] = mapped_column(Text, nullable=False)
    vigente: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    consumido: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date, nullable=True)
    fecha_carga: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
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

    empresa: Mapped["Empresa"] = relationship("Empresa")

    def is_low_stock(self) -> bool:
        total = self.num_fin - self.num_inicio + 1
        if total == 0:
            return False
        return self.consumido / total >= 0.9

    def is_expiring_soon(self) -> bool:
        if self.fecha_vencimiento is None:
            return False
        return (self.fecha_vencimiento - date.today()).days < 30

    __table_args__ = (
        UniqueConstraint("empresa_id", "tipo_dte", "num_inicio", name="uq_cafs_empresa_tipo_inicio"),
        CheckConstraint("num_fin > num_inicio", name="ck_cafs_num_fin_gt_num_inicio"),
        Index("ix_cafs_empresa_tipo_dte", "empresa_id", "tipo_dte"),
    )
