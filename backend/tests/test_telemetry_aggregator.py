"""Tests for Telemetry T2.1: perf_rollup + cost_rollup aggregation."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.tasks.telemetry import (
    _drain_redis,
    _floor_hour,
    _percentile,
    aggregate_perf_hourly,
    aggregate_cost_hourly,
    cleanup_old_rollups,
)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def test_floor_hour_truncates_minutes():
    ts = int(datetime(2026, 5, 5, 14, 37, 22, tzinfo=timezone.utc).timestamp())
    assert _floor_hour(ts) == datetime(2026, 5, 5, 14, 0, 0, tzinfo=timezone.utc)


def test_percentile_empty():
    assert _percentile([], 50) == 0.0


def test_percentile_single():
    assert _percentile([100.0], 95) == 100.0


def test_percentile_p50():
    vals = sorted([10.0, 20.0, 30.0, 40.0, 50.0])
    # idx = max(0, int(5*50/100)-1) = max(0, 2-1) = 1 → 20.0
    assert _percentile(vals, 50) == 20.0


def test_percentile_p95():
    vals = sorted(float(i) for i in range(1, 101))  # 1..100
    # idx = max(0, int(100*95/100)-1) = 94 → val 95
    assert _percentile(vals, 95) == 95.0


# ---------------------------------------------------------------------------
# _drain_redis
# ---------------------------------------------------------------------------

def _make_redis_mock(items: list[str]):
    r = MagicMock()
    pipe = MagicMock()
    pipe.execute.return_value = (items, None)
    r.pipeline.return_value = pipe
    return r


def test_drain_redis_returns_parsed_dicts():
    events = [json.dumps({"a": 1}), json.dumps({"b": 2})]
    result = _drain_redis(_make_redis_mock(events), "key")
    assert result == [{"a": 1}, {"b": 2}]


def test_drain_redis_skips_invalid_json():
    events = [json.dumps({"ok": True}), "not-json", json.dumps({"also": "ok"})]
    result = _drain_redis(_make_redis_mock(events), "key")
    assert len(result) == 2
    assert result[0] == {"ok": True}


def test_drain_redis_empty():
    assert _drain_redis(_make_redis_mock([]), "key") == []


# ---------------------------------------------------------------------------
# aggregate_perf_hourly — synthetic fixture
# ---------------------------------------------------------------------------

def _make_event(ts, route, empresa_id, latency_ms, status=200, queries=1):
    return json.dumps({
        "ts": ts,
        "route": route,
        "empresa_id": empresa_id,
        "latency_ms": latency_ms,
        "status": status,
        "queries": queries,
    })


def test_aggregate_perf_hourly_writes_correct_rows(db):
    base_ts = int(datetime(2026, 5, 5, 10, 15, 0, tzinfo=timezone.utc).timestamp())
    events = [
        _make_event(base_ts, "/api/facturas", 1, 100, queries=2),
        _make_event(base_ts + 60, "/api/facturas", 1, 200, queries=3),
        _make_event(base_ts + 120, "/api/facturas", 1, 500, status=500, queries=1),
        _make_event(base_ts + 30, "/api/clientes", 2, 50, queries=1),
    ]
    redis_mock = _make_redis_mock(events)

    with patch("app.core.request_logger._get_redis", return_value=redis_mock), \
         patch("app.tasks.telemetry.SessionLocal", return_value=db):
        aggregate_perf_hourly.run()

    from app.models.telemetry import PerfRollup
    rows = db.query(PerfRollup).order_by(PerfRollup.route).all()
    assert len(rows) == 2

    clientes = next(r for r in rows if r.route == "/api/clientes")
    facturas = next(r for r in rows if r.route == "/api/facturas")

    assert clientes.count == 1
    assert clientes.empresa_id == 2
    assert clientes.errors == 0
    assert clientes.total_queries == 1

    assert facturas.count == 3
    assert facturas.empresa_id == 1
    assert facturas.errors == 1
    assert facturas.total_queries == 6
    # p50 of [100, 200, 500]: idx=0 → 100
    assert facturas.p50_ms == 100.0
    # p95: idx=max(0, int(3*95/100)-1)=1 → 200
    assert facturas.p95_ms == 200.0


def test_aggregate_perf_hourly_no_events_skips(db):
    with patch("app.core.request_logger._get_redis", return_value=_make_redis_mock([])):
        aggregate_perf_hourly.run()

    from app.models.telemetry import PerfRollup
    assert db.query(PerfRollup).count() == 0


def test_aggregate_perf_hourly_redis_none_skips(db):
    with patch("app.core.request_logger._get_redis", return_value=None):
        aggregate_perf_hourly.run()

    from app.models.telemetry import PerfRollup
    assert db.query(PerfRollup).count() == 0


# ---------------------------------------------------------------------------
# aggregate_cost_hourly
# ---------------------------------------------------------------------------

def _make_cost_event(ts, empresa_id, cost_clp):
    return json.dumps({"ts": ts, "empresa_id": empresa_id, "cost_clp": cost_clp})


def test_aggregate_cost_hourly_sums_correctly(db):
    base_ts = int(datetime(2026, 5, 5, 11, 5, 0, tzinfo=timezone.utc).timestamp())
    events = [
        _make_cost_event(base_ts, 1, 500),
        _make_cost_event(base_ts + 60, 1, 300),
        _make_cost_event(base_ts + 120, 2, 200),
    ]
    redis_mock = _make_redis_mock(events)

    with patch("app.core.request_logger._get_redis", return_value=redis_mock), \
         patch("app.tasks.telemetry.SessionLocal", return_value=db):
        aggregate_cost_hourly.run()

    from app.models.telemetry import CostRollup
    rows = db.query(CostRollup).order_by(CostRollup.empresa_id).all()
    assert len(rows) == 2

    e1 = next(r for r in rows if r.empresa_id == 1)
    e2 = next(r for r in rows if r.empresa_id == 2)

    assert e1.total_cost_clp == 800
    assert e1.count == 2
    assert e2.total_cost_clp == 200
    assert e2.count == 1


# ---------------------------------------------------------------------------
# cleanup_old_rollups
# ---------------------------------------------------------------------------

def test_cleanup_old_rollups_removes_old_rows(db):
    from app.models.telemetry import PerfRollup, CostRollup

    now = datetime.now(tz=timezone.utc)
    old = now - timedelta(days=91)
    recent = now - timedelta(days=10)

    db.add(PerfRollup(hour=old, route="/old", count=1, p50_ms=0, p95_ms=0, p99_ms=0, errors=0, total_queries=0))
    db.add(PerfRollup(hour=recent, route="/new", count=1, p50_ms=0, p95_ms=0, p99_ms=0, errors=0, total_queries=0))
    db.add(CostRollup(hour=old, empresa_id=1, total_cost_clp=100, count=1))
    db.add(CostRollup(hour=recent, empresa_id=1, total_cost_clp=50, count=1))
    db.commit()

    with patch("app.tasks.telemetry.SessionLocal", return_value=db):
        cleanup_old_rollups.run()

    assert db.query(PerfRollup).count() == 1
    assert db.query(PerfRollup).first().route == "/new"
    assert db.query(CostRollup).count() == 1
    assert db.query(CostRollup).first().total_cost_clp == 50
