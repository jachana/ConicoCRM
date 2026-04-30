from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import Boolean, ForeignKey, String, Text, DateTime, Numeric, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EmpresaRutAdicional(Base):
    __tablename__ = "empresa_ruts_adicionales"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id", ondelete="CASCADE"))
    rut: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    empresa: Mapped["Empresa"] = relationship(back_populates="ruts_rel")


class Empresa(Base):
    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(255))
    razon_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rut: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True, index=True)
    rut_no_oficial: Mapped[bool] = mapped_column(Boolean(), default=False, server_default="false")
    linea_credito: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    plazo_credito: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nota_cobranza: Mapped[str | None] = mapped_column(Text, nullable=True)
    ubicacion: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    clientes: Mapped[list["Cliente"]] = relationship("Cliente", back_populates="empresa")
    sedes_despacho: Mapped[list["SedeDespacho"]] = relationship(
        "SedeDespacho", back_populates="empresa", cascade="all, delete-orphan"
    )
    contactos: Mapped[list["ContactoEmpresa"]] = relationship(
        "ContactoEmpresa", back_populates="empresa", cascade="all, delete-orphan"
    )
    ruts_rel: Mapped[list["EmpresaRutAdicional"]] = relationship(
        "EmpresaRutAdicional", back_populates="empresa", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def ruts_adicionales(self) -> list[str]:
        return [r.rut for r in self.ruts_rel]
