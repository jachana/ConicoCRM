"""Tests for Celery task metrics signal handlers (Telemetry T1.4)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

import app.core.celery_metrics as celery_metrics


def _reset():
    celery_metrics._task_start.clear()
    celery_metrics._connected = False


def _make_task(name: str = "app.tasks.example"):
    t = MagicMock()
    t.name = name
    return t


# ---------------------------------------------------------------------------
# _get_empresa_id
# ---------------------------------------------------------------------------

def test_get_empresa_id_from_kwargs():
    assert celery_metrics._get_empresa_id({"empresa_id": 7}) == 7


def test_get_empresa_id_missing():
    assert celery_metrics._get_empresa_id({}) is None


def test_get_empresa_id_none():
    assert celery_metrics._get_empresa_id(None) is None


# ---------------------------------------------------------------------------
# _on_prerun stores start_ts
# ---------------------------------------------------------------------------

def test_prerun_stores_start_ts():
    _reset()
    task = _make_task()
    celery_metrics._on_prerun(task, task_id="tid-1", args=[], kwargs={})
    assert "tid-1" in celery_metrics._task_start


# ---------------------------------------------------------------------------
# _on_postrun — success
# ---------------------------------------------------------------------------

def test_postrun_logs_success():
    _reset()
    task = _make_task("app.tasks.foo")
    celery_metrics._task_start["tid-2"] = 0.0  # inject a very old start_ts

    with patch.object(celery_metrics.logger, "bind") as mock_bind:
        bound = MagicMock()
        mock_bind.return_value = bound
        celery_metrics._on_postrun(
            task, task_id="tid-2", args=[], kwargs={"empresa_id": 3},
            retval=None, state="SUCCESS",
        )

    assert "tid-2" not in celery_metrics._task_start
    kwargs = mock_bind.call_args.kwargs
    assert kwargs["task_name"] == "app.tasks.foo"
    assert kwargs["status"] == "success"
    assert kwargs["empresa_id"] == 3
    assert kwargs["latency_ms"] >= 0
    bound.info.assert_called_once_with("celery.task")


def test_postrun_missing_start_ts_yields_minus_one():
    _reset()
    task = _make_task()
    with patch.object(celery_metrics.logger, "bind") as mock_bind:
        bound = MagicMock()
        mock_bind.return_value = bound
        celery_metrics._on_postrun(
            task, task_id="tid-unknown", args=[], kwargs={},
            retval=None, state="SUCCESS",
        )
    assert mock_bind.call_args.kwargs["latency_ms"] == -1


# ---------------------------------------------------------------------------
# _on_failure
# ---------------------------------------------------------------------------

def test_failure_logs_error():
    _reset()
    task = _make_task("app.tasks.bar")
    celery_metrics._task_start["tid-3"] = 0.0

    exc = ValueError("boom")
    einfo = MagicMock()

    with patch.object(celery_metrics.logger, "bind") as mock_bind:
        bound = MagicMock()
        mock_bind.return_value = bound
        celery_metrics._on_failure(
            task, exc=exc, task_id="tid-3", args=[], kwargs={"empresa_id": 9},
            einfo=einfo,
        )

    assert "tid-3" not in celery_metrics._task_start
    kwargs = mock_bind.call_args.kwargs
    assert kwargs["status"] == "failure"
    assert kwargs["exception_class"] == "ValueError"
    assert kwargs["empresa_id"] == 9
    assert "traceback" in kwargs
    bound.error.assert_called_once_with("celery.task")


def test_failure_traceback_truncated():
    _reset()
    task = _make_task()
    exc = RuntimeError("x" * 5000)

    with patch.object(celery_metrics.logger, "bind") as mock_bind:
        bound = MagicMock()
        mock_bind.return_value = bound
        celery_metrics._on_failure(
            task, exc=exc, task_id="tid-trunc", args=[], kwargs={}, einfo=MagicMock(),
        )

    tb = mock_bind.call_args.kwargs["traceback"]
    assert len(tb) <= 1000


# ---------------------------------------------------------------------------
# _on_revoked
# ---------------------------------------------------------------------------

def test_revoked_logs_warning():
    _reset()
    request = MagicMock()
    request.id = "tid-4"
    request.task = "app.tasks.baz"
    celery_metrics._task_start["tid-4"] = 0.0

    with patch.object(celery_metrics.logger, "bind") as mock_bind:
        bound = MagicMock()
        mock_bind.return_value = bound
        celery_metrics._on_revoked(request, terminated=True, signum=None, expired=False)

    assert "tid-4" not in celery_metrics._task_start
    kwargs = mock_bind.call_args.kwargs
    assert kwargs["status"] == "revoked"
    bound.warning.assert_called_once_with("celery.task")


# ---------------------------------------------------------------------------
# _on_retry
# ---------------------------------------------------------------------------

def test_retry_logs_warning():
    _reset()
    request = MagicMock()
    request.id = "tid-5"
    request.task = "app.tasks.retryable"

    with patch.object(celery_metrics.logger, "bind") as mock_bind:
        bound = MagicMock()
        mock_bind.return_value = bound
        celery_metrics._on_retry(request, reason=ConnectionError("timeout"), einfo=MagicMock())

    kwargs = mock_bind.call_args.kwargs
    assert kwargs["status"] == "retried"
    assert kwargs["exception_class"] == "ConnectionError"
    bound.warning.assert_called_once_with("celery.task")


# ---------------------------------------------------------------------------
# connect() — idempotent
# ---------------------------------------------------------------------------

def test_connect_idempotent():
    _reset()
    with patch("celery.signals.task_prerun") as mock_sig:
        mock_sig.connect = MagicMock()
        # Patch all signals
        with patch("celery.signals.task_postrun") as ps, \
             patch("celery.signals.task_failure") as fs, \
             patch("celery.signals.task_revoked") as rs, \
             patch("celery.signals.task_retry") as rts:
            ps.connect = MagicMock()
            fs.connect = MagicMock()
            rs.connect = MagicMock()
            rts.connect = MagicMock()

            celery_metrics.connect()
            celery_metrics.connect()  # second call — should be no-op

        assert mock_sig.connect.call_count == 1
