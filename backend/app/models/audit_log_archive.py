"""Archive table for audit_log rows past the retention window.

Mirrors AuditLog columns but with no FK on user_id (users may be deleted;
archive must be self-contained).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLogArchive(Base):
    __tablename__ = "audit_log_archive"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    # Plain Integer — no FK; referenced user may have been deleted.
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False)
    diff_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    __table_args__ = (
        Index("ix_audit_log_archive_entity", "entity_type", "entity_id"),
    )
