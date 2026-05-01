"""
Import Report Model

Tracks payment import sessions and detailed results for each import.
Allows users to download and review import history with per-row details.
"""

from datetime import datetime, timezone
from sqlalchemy import DateTime, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ImportReport(Base):
    __tablename__ = "payment_import_reports"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Import session ID (UUID, for linking multiple retries)
    import_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)

    # Summary counts
    created_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pending_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Total rows processed
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False)

    # Import status: success, partial, error
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    # Detailed report as JSON (array of row results)
    report_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Error message if import failed (only for fatal errors)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Filename of uploaded file
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)

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
