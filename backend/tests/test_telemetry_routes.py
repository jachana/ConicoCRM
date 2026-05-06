"""Tests for Telemetry T2.2: GET /admin/telemetry/routes."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import TestingSession


def _make_rollup(route, hour_offset=0, count=100, p50=10.0, p95=50.0, p99=90.0, errors=0, empresa_id=None):
    from app.models.telemetry import PerfRollup
    hour = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(hours=hour_offset)
    return PerfRollup(
        hour=hour,
        route=route,
        empresa_id=empresa_id,
        count=count,
        p50_ms=p50,
        p95_ms=p95,
        p99_ms=p99,
        errors=errors,
        total_queries=count * 2,
    )


@pytest.fixture
def rollup_data(setup_test_db):
    db = TestingSession()
    rows = [
        _make_rollup("/api/facturas", hour_offset=1, count=200, p95=120.0, errors=4),
        _make_rollup("/api/facturas", hour_offset=2, count=100, p95=80.0, errors=1),
        _make_rollup("/api/clientes", hour_offset=1, count=50, p95=30.0, errors=0),
        _make_rollup("/api/clientes", hour_offset=2, count=50, p95=40.0, errors=0),
        _make_rollup("/api/productos", hour_offset=1, count=300, p95=20.0, errors=0),
        # excluded routes
        _make_rollup("healthz", hour_offset=1, count=500, p95=5.0),
        _make_rollup("/static/app.js", hour_offset=1, count=200, p95=3.0),
        # empresa-scoped
        _make_rollup("/api/facturas", hour_offset=1, count=10, p95=200.0, empresa_id=99),
    ]
    for r in rows:
        db.add(r)
    db.commit()
    db.close()


def test_requires_admin(client, vendedor_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_basic_response(client, admin_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["period"] == "24h"
    routes = {r["route"] for r in data["routes"]}
    assert "/api/facturas" in routes
    assert "/api/clientes" in routes
    assert "/api/productos" in routes


def test_excludes_health_and_static(client, admin_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    routes = {r["route"] for r in resp.json()["routes"]}
    assert "healthz" not in routes
    assert "/static/app.js" not in routes


def test_order_by_p95(client, admin_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes?order_by=p95",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    routes = resp.json()["routes"]
    p95s = [r["p95"] for r in routes]
    assert p95s == sorted(p95s, reverse=True)


def test_order_by_count(client, admin_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes?order_by=count",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    routes = resp.json()["routes"]
    counts = [r["count"] for r in routes]
    assert counts == sorted(counts, reverse=True)


def test_order_by_error_rate(client, admin_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes?order_by=error_rate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    routes = resp.json()["routes"]
    error_rates = [r["error_rate"] for r in routes]
    assert error_rates == sorted(error_rates, reverse=True)
    assert routes[0]["route"] == "/api/facturas"


def test_limit(client, admin_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes?limit=1",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert len(resp.json()["routes"]) == 1


def test_empresa_id_filter(client, admin_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes?empresa_id=99",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    routes = resp.json()["routes"]
    assert len(routes) == 1
    assert routes[0]["route"] == "/api/facturas"
    assert routes[0]["count"] == 10


def test_trend_buckets_present(client, admin_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes?order_by=p95",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    facturas = next(r for r in resp.json()["routes"] if r["route"] == "/api/facturas")
    # 3 rollup rows total for /api/facturas (2 unscoped + 1 empresa_id=99)
    assert len(facturas["trend"]) == 3
    for bucket in facturas["trend"]:
        assert "hour" in bucket
        assert "p95" in bucket
        assert "count" in bucket


def test_metrics_aggregation(client, admin_token, rollup_data):
    resp = client.get(
        "/api/admin/telemetry/routes?order_by=count",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    facturas = next(r for r in resp.json()["routes"] if r["route"] == "/api/facturas")
    # 200 + 100 + 10 (empresa_id=99 included when no empresa filter)
    assert facturas["count"] == 310
    assert facturas["error_rate"] == pytest.approx(5 / 310, abs=0.001)


def test_empty_period(client, admin_token, setup_test_db):
    resp = client.get(
        "/api/admin/telemetry/routes?period=7d",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["routes"] == []
