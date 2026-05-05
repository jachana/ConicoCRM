"""Tests for db_metrics slow-query listener (Telemetry T1.2)."""
from __future__ import annotations

import time
from unittest.mock import MagicMock, call, patch

import pytest
from sqlalchemy import create_engine, text

import app.core.db_metrics as db_metrics


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_engine():
    return create_engine("sqlite:///:memory:")


def _reset_module():
    """Reset module-level state between tests."""
    db_metrics._listener_installed = False


# ---------------------------------------------------------------------------
# _normalize_sql
# ---------------------------------------------------------------------------

def test_normalize_sql_collapses_whitespace():
    sql = "SELECT  *\nFROM   foo\n  WHERE id = 1"
    assert db_metrics._normalize_sql(sql) == "SELECT * FROM foo WHERE id = 1"


def test_normalize_sql_truncates_at_1kb():
    sql = "SELECT " + "x" * 2000
    result = db_metrics._normalize_sql(sql)
    assert len(result.encode("utf-8")) <= db_metrics._SQL_MAX_BYTES + 3  # +3 for '...'
    assert result.endswith("...")


def test_normalize_sql_short_unchanged():
    sql = "SELECT 1"
    assert db_metrics._normalize_sql(sql) == "SELECT 1"


# ---------------------------------------------------------------------------
# install() — feature flag off
# ---------------------------------------------------------------------------

def test_install_noop_when_disabled():
    _reset_module()
    engine = _make_engine()
    with patch("app.config.settings") as mock_settings:
        mock_settings.db_metrics_enabled = False
        mock_settings.slow_query_ms = 200
        db_metrics.install(engine)
    # No listeners attached — executing a query should not raise
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


# ---------------------------------------------------------------------------
# install() — slow query is logged
# ---------------------------------------------------------------------------

def test_slow_query_logged(monkeypatch):
    _reset_module()
    engine = _make_engine()

    monkeypatch.setattr("app.config.settings.db_metrics_enabled", True)
    monkeypatch.setattr("app.config.settings.slow_query_ms", 0)  # threshold=0 → always slow

    with patch.object(db_metrics.logger, "bind") as mock_bind:
        bound = MagicMock()
        mock_bind.return_value = bound
        db_metrics.install(engine)

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    mock_bind.assert_called_once()
    kwargs = mock_bind.call_args.kwargs
    assert "duration_ms" in kwargs
    assert kwargs["duration_ms"] >= 0
    assert "sql_normalized" in kwargs
    assert "SELECT 1" in kwargs["sql_normalized"]
    assert "params_count" in kwargs
    bound.warning.assert_called_once_with("slow_query")


# ---------------------------------------------------------------------------
# install() — fast query NOT logged
# ---------------------------------------------------------------------------

def test_fast_query_not_logged(monkeypatch):
    _reset_module()
    engine = _make_engine()

    monkeypatch.setattr("app.config.settings.db_metrics_enabled", True)
    monkeypatch.setattr("app.config.settings.slow_query_ms", 999_999)  # threshold=1M ms

    with patch.object(db_metrics.logger, "bind") as mock_bind:
        db_metrics.install(engine)

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    mock_bind.assert_not_called()


# ---------------------------------------------------------------------------
# request_id propagated from ContextVar
# ---------------------------------------------------------------------------

def test_request_id_included_in_log(monkeypatch):
    _reset_module()
    engine = _make_engine()

    monkeypatch.setattr("app.config.settings.db_metrics_enabled", True)
    monkeypatch.setattr("app.config.settings.slow_query_ms", 0)

    token = db_metrics.current_request_id.set("req-abc-123")
    try:
        with patch.object(db_metrics.logger, "bind") as mock_bind:
            bound = MagicMock()
            mock_bind.return_value = bound
            db_metrics.install(engine)

            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))

        kwargs = mock_bind.call_args.kwargs
        assert kwargs.get("request_id") == "req-abc-123"
    finally:
        db_metrics.current_request_id.reset(token)


# ---------------------------------------------------------------------------
# Nested transactions (SAVEPOINT) — no crash, stack balanced
# ---------------------------------------------------------------------------

def test_nested_transactions_no_crash(monkeypatch):
    _reset_module()
    engine = _make_engine()

    monkeypatch.setattr("app.config.settings.db_metrics_enabled", True)
    monkeypatch.setattr("app.config.settings.slow_query_ms", 0)

    db_metrics.install(engine)

    # Nested begin/commit should not raise or corrupt stack
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(text("CREATE TABLE IF NOT EXISTS t (id INTEGER)"))
            with conn.begin_nested():
                conn.execute(text("INSERT INTO t VALUES (1)"))
            conn.execute(text("SELECT * FROM t"))


# ---------------------------------------------------------------------------
# install() is idempotent
# ---------------------------------------------------------------------------

def test_install_idempotent(monkeypatch):
    _reset_module()
    engine = _make_engine()

    monkeypatch.setattr("app.config.settings.db_metrics_enabled", True)
    monkeypatch.setattr("app.config.settings.slow_query_ms", 0)

    db_metrics.install(engine)
    db_metrics.install(engine)  # second call should not register duplicate listeners

    with patch.object(db_metrics.logger, "bind") as mock_bind:
        bound = MagicMock()
        mock_bind.return_value = bound
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    # Only one call despite two install() calls
    assert mock_bind.call_count == 1
