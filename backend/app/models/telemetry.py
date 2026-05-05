"""Telemetry rollup tables (T2.1)."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PerfRollup(Base):
    __tablename__ = "perf_rollup"
    __table_args__ = (
        Index("ix_perf_rollup_hour_route", "hour", "route"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hour: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    route: Mapped[str] = mapped_column(String(500), nullable=False)
    empresa_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    p50_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    p95_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    p99_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    errors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_queries: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class CostRollup(Base):
    __tablename__ = "cost_rollup"
    __table_args__ = (
        Index("ix_cost_rollup_hour_empresa", "hour", "empresa_id"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hour: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    empresa_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_cost_clp: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
