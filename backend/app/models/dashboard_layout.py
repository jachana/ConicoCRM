from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class DashboardLayout(Base):
    __tablename__ = "dashboard_layouts"

    role: Mapped[str] = mapped_column(String(20), primary_key=True)
    layout_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
