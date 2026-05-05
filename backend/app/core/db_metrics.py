"""SQLAlchemy slow-query event listener (Telemetry T1.2).

Logs a structured 'slow_query' line for any query that exceeds SLOW_QUERY_MS.
Enabled only when DB_METRICS_ENABLED=true (defaults false to avoid dev overhead).
"""
from __future__ import annotations

import re
import time
from contextvars import ContextVar
from typing import Optional

from app.core.logging import logger

# Propagate request_id from HTTP middleware into the DB listener.
# Set by RequestLoggerMiddleware at the start of each request.
current_request_id: ContextVar[Optional[str]] = ContextVar("_db_metrics_request_id", default=None)

_SQL_MAX_BYTES = 1024
_listener_installed = False


def _normalize_sql(sql: str) -> str:
    normalized = re.sub(r"\s+", " ", sql).strip()
    encoded = normalized.encode("utf-8")
    if len(encoded) > _SQL_MAX_BYTES:
        return encoded[:_SQL_MAX_BYTES].decode("utf-8", errors="replace") + "..."
    return normalized


def install(engine=None) -> None:
    """Register slow-query listeners on *engine*. Idempotent. No-op if disabled."""
    global _listener_installed
    if _listener_installed:
        return
    _listener_installed = True

    from app.config import settings

    if not settings.db_metrics_enabled:
        return

    if engine is None:
        from app.database import engine as _engine  # type: ignore[assignment]

        engine = _engine

    from sqlalchemy import event

    @event.listens_for(engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany):
        conn.info.setdefault("_sq_stack", []).append(time.perf_counter())

    @event.listens_for(engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany):
        stack = conn.info.get("_sq_stack", [])
        if not stack:
            return
        start = stack.pop()
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        if duration_ms < settings.slow_query_ms:
            return

        params_count = len(parameters) if parameters else 0

        logger.bind(
            request_id=current_request_id.get(),
            sql_normalized=_normalize_sql(statement),
            duration_ms=duration_ms,
            params_count=params_count,
        ).warning("slow_query")


__all__ = ["install", "current_request_id"]
