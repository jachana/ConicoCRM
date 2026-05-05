from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CostTariff(Base):
    __tablename__ = "cost_tariff"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    descripcion: Mapped[str] = mapped_column(String(200), nullable=False)
    costo_clp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("NOW()"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("NOW()"),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
