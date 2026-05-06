"""Tests for Telemetry T2.3: GET /admin/telemetry/cost."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import TestingSession


def _hour(offset=0):
    return datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(hours=offset)


def _make_perf(route, empresa_id=None, count=100, p95=50.0, hour_offset=1):
    from app.models.telemetry import PerfRollup
    return PerfRollup(
        hour=_hour(hour_offset),
        route=route,
        empresa_id=empresa_id,
        count=count,
        p50_ms=20.0,
        p95_ms=p95,
        p99_ms=p95 * 1.5,
        errors=0,
        total_queries=count * 2,
    )


def _make_cost(empresa_id=None, count=5, cost_clp=1000, hour_offset=1):
    from app.models.telemetry import CostRollup
    return CostRollup(
        hour=_hour(hour_offset),
        empresa_id=empresa_id,
        count=count,
        total_cost_clp=cost_clp,
    )


_factura_counter = 0


def _make_factura_with_dte(empresa_id, cliente_id, db):
    global _factura_counter
    from app.models.dte_emision import DteEmision
    from app.models.factura import Factura

    _factura_counter += 1
    factura = Factura(
        numero=_factura_counter,
        empresa_id=empresa_id,
        cliente_id=cliente_id,
        total_neto=1000,
        total_iva=190,
        total=1190,
    )
    db.add(factura)
    db.flush()

    dte = DteEmision(
        tipo="033",
        factura_id=factura.id,
        monto_neto=1000,
        monto_iva=190,
        monto_total=1190,
        created_at=_hour(1),
    )
    db.add(dte)
    return factura


@pytest.fixture
def cost_data(setup_test_db):
    from app.models.cliente import Cliente
    from app.models.empresa import Empresa

    db = TestingSession()
    try:
        e1 = Empresa(nombre="Empresa A", rut="11.111.111-1")
        e2 = Empresa(nombre="Empresa B", rut="22.222.222-2")
        db.add_all([e1, e2])
        db.flush()

        c1 = Cliente(nombre="Cliente A", empresa_id=e1.id)
        c2 = Cliente(nombre="Cliente B", empresa_id=e2.id)
        db.add_all([c1, c2])
        db.flush()

        db.add_all([
            _make_perf("/api/facturas", empresa_id=e1.id, count=200, p95=500.0),
            _make_perf("/api/clientes", empresa_id=e1.id, count=100, p95=1200.0),  # slow (>1000ms)
            _make_perf("/api/facturas", empresa_id=e2.id, count=50, p95=200.0),
            _make_cost(empresa_id=e1.id, count=10, cost_clp=5000),
            _make_cost(empresa_id=e2.id, count=3, cost_clp=1500),
        ])
        db.flush()

        _make_factura_with_dte(e1.id, c1.id, db)
        _make_factura_with_dte(e1.id, c1.id, db)
        _make_factura_with_dte(e2.id, c2.id, db)
        db.commit()

        yield {"e1_id": e1.id, "e2_id": e2.id}
    finally:
        db.close()


def test_requires_admin(client, vendedor_token, cost_data):
    resp = client.get(
        "/api/admin/telemetry/cost",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_basic_response(client, admin_token, cost_data):
    resp = client.get(
        "/api/admin/telemetry/cost",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["period"] == "30d"
    assert "empresas" in data
    assert "total" in data


def test_multi_empresa_results(client, admin_token, cost_data):
    e1_id, e2_id = cost_data["e1_id"], cost_data["e2_id"]
    resp = client.get(
        "/api/admin/telemetry/cost",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    ids = {e["empresa_id"] for e in resp.json()["empresas"]}
    assert e1_id in ids
    assert e2_id in ids


def test_lioren_aggregation(client, admin_token, cost_data):
    e1_id = cost_data["e1_id"]
    resp = client.get(
        f"/api/admin/telemetry/cost?empresa_id={e1_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    e = resp.json()["empresas"][0]
    assert e["lioren_call_count"] == 10
    assert e["lioren_cost_clp"] == 5000


def test_request_count(client, admin_token, cost_data):
    e1_id = cost_data["e1_id"]
    resp = client.get(
        f"/api/admin/telemetry/cost?empresa_id={e1_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    e = resp.json()["empresas"][0]
    assert e["request_count"] == 300  # 200 + 100


def test_slow_request_count(client, admin_token, cost_data):
    e1_id = cost_data["e1_id"]
    resp = client.get(
        f"/api/admin/telemetry/cost?empresa_id={e1_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    e = resp.json()["empresas"][0]
    # p95=1200 > 1000 threshold → 100 slow requests; p95=500 → not slow
    assert e["slow_request_count"] == 100


def test_dte_emitidos_count(client, admin_token, cost_data):
    e1_id = cost_data["e1_id"]
    resp = client.get(
        f"/api/admin/telemetry/cost?empresa_id={e1_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    e = resp.json()["empresas"][0]
    assert e["dte_emitidos_count"] == 2


def test_total_aggregate(client, admin_token, cost_data):
    resp = client.get(
        "/api/admin/telemetry/cost",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    total = resp.json()["total"]
    assert total["empresa_id"] is None
    assert total["lioren_call_count"] == 13  # 10 + 3
    assert total["lioren_cost_clp"] == 6500  # 5000 + 1500
    assert total["dte_emitidos_count"] == 3  # 2 + 1


def test_empresa_id_filter_isolates(client, admin_token, cost_data):
    e2_id = cost_data["e2_id"]
    resp = client.get(
        f"/api/admin/telemetry/cost?empresa_id={e2_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = resp.json()
    assert len(data["empresas"]) == 1
    e = data["empresas"][0]
    assert e["empresa_id"] == e2_id
    assert e["lioren_call_count"] == 3


def test_empty_period(client, admin_token, setup_test_db):
    resp = client.get(
        "/api/admin/telemetry/cost?period=24h",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["empresas"] == []
    assert data["total"]["request_count"] == 0
