"""Tests for /api/reportes endpoints (ventas, cobranza, inventario)."""


def test_ventas_returns_valid_structure(client, admin_token):
    r = client.get(
        "/api/reportes/ventas",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data
    assert "ventas_diarias" in data
    assert "top_clientes" in data
    assert "por_vendedor" in data
    kpis = data["kpis"]
    assert "total_vendido" in kpis
    assert "num_facturas" in kpis
    assert "ticket_promedio" in kpis
    assert "total_por_cobrar" in kpis
    assert "variacion_vs_periodo_anterior" in kpis


def test_ventas_date_validation(client, admin_token):
    r = client.get(
        "/api/reportes/ventas",
        params={"date_from": "2026-04-30", "date_to": "2026-01-01"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_ventas_empty_period_returns_zeros(client, admin_token):
    r = client.get(
        "/api/reportes/ventas",
        params={"date_from": "2000-01-01", "date_to": "2000-12-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["kpis"]["total_vendido"] == 0
    assert data["ventas_diarias"] == []


def test_cobranza_returns_valid_structure(client, admin_token):
    r = client.get(
        "/api/reportes/cobranza",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data
    assert "aging" in data
    assert "por_empresa" in data
    kpis = data["kpis"]
    assert "total_por_cobrar" in kpis
    assert "total_vencido" in kpis
    assert "proximas_a_vencer_7d" in kpis
    aging = data["aging"]
    for bucket in ("d_0_30", "d_31_60", "d_61_90", "d_90_plus"):
        assert bucket in aging
        assert "count" in aging[bucket]
        assert "monto" in aging[bucket]


def test_inventario_returns_valid_structure(client, admin_token):
    r = client.get(
        "/api/reportes/inventario",
        params={"date_from": "2026-01-01", "date_to": "2026-04-30"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data
    assert "bajo_minimo" in data
    assert "top_vendidos" in data
    kpis = data["kpis"]
    assert "valor_total_stock" in kpis
    assert "num_bajo_minimo" in kpis
    assert "num_sin_stock" in kpis


def test_requires_auth(client):
    for path in ("/api/reportes/ventas", "/api/reportes/cobranza", "/api/reportes/inventario"):
        r = client.get(path, params={"date_from": "2026-01-01", "date_to": "2026-04-30"})
        assert r.status_code == 401, f"Expected 401 for {path}, got {r.status_code}"


def test_compras_returns_valid_structure(client, admin_token):
    r = client.get(
        "/api/reportes/compras",
        params={"date_from": "2026-01-01", "date_to": "2026-12-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data and "por_proveedor" in data and "por_estado" in data
    assert "total_comprado" in data["kpis"]
    assert "num_oc_emitidas" in data["kpis"]
    assert "num_oc_pendientes" in data["kpis"]


def test_margenes_returns_valid_structure(client, admin_token):
    r = client.get(
        "/api/reportes/margenes",
        params={"date_from": "2026-01-01", "date_to": "2026-12-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data and "por_producto" in data and "por_factura" in data
    assert "margen_promedio_pct" in data["kpis"]
    assert "mejor_producto" in data["kpis"] and "peor_producto" in data["kpis"]


def test_dte_report_returns_valid_structure(client, admin_token):
    r = client.get(
        "/api/reportes/dte",
        params={"date_from": "2026-01-01", "date_to": "2026-12-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "kpis" in data and "por_tipo" in data and "emisiones" in data
    assert "total_emitidos" in data["kpis"]


def test_ventas_excel_export(client, admin_token):
    r = client.get(
        "/api/reportes/ventas/export/excel?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert "ventas-" in r.headers["content-disposition"]


def test_cobranza_excel_export(client, admin_token):
    r = client.get(
        "/api/reportes/cobranza/export/excel?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert "cobranza-" in r.headers["content-disposition"]


def test_inventario_excel_export(client, admin_token):
    r = client.get(
        "/api/reportes/inventario/export/excel?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert "inventario-" in r.headers["content-disposition"]


def test_ventas_pdf_export(client, admin_token):
    r = client.get(
        "/api/reportes/ventas/export/pdf?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert "ventas-" in r.headers["content-disposition"]
