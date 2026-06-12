"""Tests for /api/reportes endpoints (ventas, cobranza, inventario)."""

from datetime import date
from unittest.mock import patch


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


def test_compras_excel_export(client, admin_token):
    r = client.get(
        "/api/reportes/compras/export/excel?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert "compras-" in r.headers["content-disposition"]


def test_margenes_excel_export(client, admin_token):
    r = client.get(
        "/api/reportes/margenes/export/excel?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert "margenes-" in r.headers["content-disposition"]


def test_dte_excel_export(client, admin_token):
    r = client.get(
        "/api/reportes/dte/export/excel?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert "dte-" in r.headers["content-disposition"]


def test_cobranza_pdf_export(client, admin_token):
    r = client.get(
        "/api/reportes/cobranza/export/pdf?date_from=2026-01-01&date_to=2026-12-31",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert "cobranza-" in r.headers["content-disposition"]


def test_ventas_includes_boletas_key(client, admin_token):
    r = client.get(
        "/api/reportes/ventas",
        params={"date_from": "2000-01-01", "date_to": "2000-12-31"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "boletas" in data
    boletas = data["boletas"]
    assert "total" in boletas
    assert "cantidad" in boletas
    assert "ventas_diarias" in boletas
    assert boletas["total"] == 0
    assert boletas["cantidad"] == 0
    assert boletas["ventas_diarias"] == []


@patch("app.api.boletas.emit_dte")
def test_reporte_ventas_aggregates_boletas(mock_emit, client, admin_token):
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "39",
            "metodo_pago": "efectivo",
            "lineas": [
                {
                    "orden": 0,
                    "descripcion": "x",
                    "cantidad": "1",
                    "precio_unitario": "1190",
                }
            ],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    hoy = date.today().isoformat()
    r2 = client.get(
        "/api/reportes/ventas",
        params={"date_from": hoy, "date_to": hoy},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body["boletas"]["cantidad"] >= 1
    assert body["boletas"]["total"] >= 1190
    assert any(d["fecha"] == hoy for d in body["boletas"]["ventas_diarias"])


# ---------------------------------------------------------------------------
# Filtro empresa_id en ventas / cobranza
# ---------------------------------------------------------------------------

from decimal import Decimal

from app.models.boleta import Boleta
from app.models.empresa import Empresa
from app.models.factura import Factura


def _mk_dos_empresas(db):
    """Two empresas, one factura + one boleta each, all within May 2026."""
    emp1 = Empresa(nombre="EmpFiltro1-TST", rut="76111111-1")
    emp2 = Empresa(nombre="EmpFiltro2-TST", rut="76222222-2")
    db.add_all([emp1, emp2])
    db.flush()
    f1 = Factura(
        numero=910001,
        fecha=date(2026, 5, 10),
        empresa_id=emp1.id,
        estado="emitida",
        total_neto=Decimal("1000"),
        total_iva=Decimal("190"),
        total=Decimal("1190"),
    )
    f2 = Factura(
        numero=910002,
        fecha=date(2026, 5, 11),
        empresa_id=emp2.id,
        estado="emitida",
        total_neto=Decimal("2000"),
        total_iva=Decimal("380"),
        total=Decimal("2380"),
    )
    b1 = Boleta(
        numero=910001,
        fecha=date(2026, 5, 10),
        tipo_dte="39",
        empresa_id=emp1.id,
        total_neto=Decimal("500"),
        total_iva=Decimal("95"),
        total=Decimal("595"),
    )
    b2 = Boleta(
        numero=910002,
        fecha=date(2026, 5, 11),
        tipo_dte="39",
        empresa_id=emp2.id,
        total_neto=Decimal("700"),
        total_iva=Decimal("133"),
        total=Decimal("833"),
    )
    db.add_all([f1, f2, b1, b2])
    db.commit()
    return {"emp1": emp1, "emp2": emp2}


def test_ventas_filtra_por_empresa(client, admin_token, db):
    fx = _mk_dos_empresas(db)
    params = {"date_from": "2026-05-01", "date_to": "2026-05-31"}

    r_all = client.get(
        "/api/reportes/ventas",
        params=params,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r_all.status_code == 200
    assert r_all.json()["kpis"]["total_vendido"] == 3570  # 1190 + 2380

    r = client.get(
        "/api/reportes/ventas",
        params={**params, "empresa_id": fx["emp1"].id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    kpis = r.json()["kpis"]
    assert kpis["total_vendido"] == 1190  # emp2 factura excluded
    assert kpis["num_facturas"] == 1


def test_ventas_empresa_id_filtra_boletas(client, admin_token, db):
    fx = _mk_dos_empresas(db)
    r = client.get(
        "/api/reportes/ventas",
        params={
            "date_from": "2026-05-01",
            "date_to": "2026-05-31",
            "empresa_id": fx["emp1"].id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    boletas = r.json()["boletas"]
    assert boletas["cantidad"] == 1  # emp2 boleta excluded
    assert boletas["total"] == 595


def test_cobranza_filtra_por_empresa(client, admin_token, db):
    fx = _mk_dos_empresas(db)
    r = client.get(
        "/api/reportes/cobranza",
        params={
            "date_from": "2026-05-01",
            "date_to": "2026-05-31",
            "empresa_id": fx["emp1"].id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    nombres = {e["nombre"] for e in data["por_empresa"]}
    assert nombres == {"EmpFiltro1-TST"}
    assert data["kpis"]["total_por_cobrar"] == 1190  # sin pagos, solo emp1
