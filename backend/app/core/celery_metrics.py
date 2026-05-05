"""Celery task metrics via signals (Telemetry T1.4).

Captures latency, status, and empresa_id for every task execution.
Log fields: task_name, latency_ms, status, empresa_id, exception_class, traceback.
"""
from __future__ import annotations

import traceback
import time
from typing import Optional

from app.core.logging import logger

# Thread-local-style dict keyed by task.request.id → start_ts
_task_start: dict[str, float] = {}

_connected = False


def _get_empresa_id(kwargs: Optional[dict]) -> Optional[int]:
    if not kwargs:
        return None
    return kwargs.get("empresa_id") or kwargs.get("empresa")


# ---------------------------------------------------------------------------
# Signal handlers
# ---------------------------------------------------------------------------

def _on_prerun(task, task_id: str, args, kwargs, **kw):
    _task_start[task_id] = time.perf_counter()


def _on_postrun(task, task_id: str, args, kwargs, retval, state: str, **kw):
    start = _task_start.pop(task_id, None)
    latency_ms = round((time.perf_counter() - start) * 1000) if start is not None else -1
    logger.bind(
        task_name=task.name,
        task_id=task_id,
        latency_ms=latency_ms,
        status="success",
        empresa_id=_get_empresa_id(kwargs),
    ).info("celery.task")


def _on_failure(task, exc, task_id: str, args, kwargs, einfo, **kw):
    start = _task_start.pop(task_id, None)
    latency_ms = round((time.perf_counter() - start) * 1000) if start is not None else -1
    tb_summary = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    # Keep traceback short
    tb_summary = tb_summary[-1000:] if len(tb_summary) > 1000 else tb_summary
    logger.bind(
        task_name=task.name,
        task_id=task_id,
        latency_ms=latency_ms,
        status="failure",
        empresa_id=_get_empresa_id(kwargs),
        exception_class=type(exc).__name__,
        traceback=tb_summary,
    ).error("celery.task")


def _on_revoked(request, terminated: bool, signum, expired: bool, **kw):
    task_id = request.id if hasattr(request, "id") else str(request)
    _task_start.pop(task_id, None)
    logger.bind(
        task_name=getattr(request, "task", "unknown"),
        task_id=task_id,
        latency_ms=-1,
        status="revoked",
        empresa_id=None,
    ).warning("celery.task")


def _on_retry(request, reason, einfo, **kw):
    task_id = request.id if hasattr(request, "id") else str(request)
    logger.bind(
        task_name=getattr(request, "task", "unknown"),
        task_id=task_id,
        latency_ms=-1,
        status="retried",
        empresa_id=None,
        exception_class=type(reason).__name__ if reason else None,
    ).warning("celery.task")


# ---------------------------------------------------------------------------
# connect() — idempotent
# ---------------------------------------------------------------------------

def connect(app=None) -> None:
    """Wire all signal handlers into *app*. Idempotent."""
    global _connected
    if _connected:
        return
    _connected = True

    from celery.signals import (
        task_prerun,
        task_postrun,
        task_failure,
        task_revoked,
        task_retry,
    )

    task_prerun.connect(_on_prerun, weak=False)
    task_postrun.connect(_on_postrun, weak=False)
    task_failure.connect(_on_failure, weak=False)
    task_revoked.connect(_on_revoked, weak=False)
    task_retry.connect(_on_retry, weak=False)


__all__ = ["connect", "_task_start"]
