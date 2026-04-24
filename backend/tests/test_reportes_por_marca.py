"""Tests for /api/reportes/por-marca endpoint."""


def test_por_marca_returns_valid_structure(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data
    assert "por_marca" in data
    assert "por_marca_cliente" in data
    assert "sin_marca" in data
    kpis = data["kpis"]
    for k in (
        "total_neto",
        "total_bruto",
        "ganancia_total",
        "margen_promedio_pct",
        "num_facturas",
        "num_marcas",
        "ticket_promedio",
        "cantidad_total",
    ):
        assert k in kpis, f"kpi {k} missing"


def test_por_marca_date_validation(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-04-30", "date_to": "2026-01-01"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_por_marca_requires_auth(client):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
    )
    assert r.status_code == 401


def test_por_marca_empty_period_returns_zeros(client, admin_token):
    r = client.get(
        "/api/reportes/por-marca",
        params={"date_from": "2000-01-01", "date_to": "2000-12-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["kpis"]["total_neto"] == 0
    assert data["kpis"]["num_facturas"] == 0
    assert data["por_marca"] == []
    assert data["por_marca_cliente"] == []
