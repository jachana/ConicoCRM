"""Tests that vendedor role gets 403 on admin/subadmin-only endpoints."""

_DATE_PARAMS = {"date_from": "2026-01-01", "date_to": "2026-04-30"}


def test_vendedor_cannot_get_cobranza_dashboard(client, vendedor_token):
    resp = client.get(
        "/api/cobranza/dashboard",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_get_cobranza_recordatorios(client, vendedor_token):
    resp = client.get(
        "/api/cobranza/recordatorios",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_list_notas_credito(client, vendedor_token):
    resp = client.get(
        "/api/dte/notas-credito/",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_list_notas_debito(client, vendedor_token):
    resp = client.get(
        "/api/dte/notas-debito/",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_get_reporte_ventas(client, vendedor_token):
    resp = client.get(
        "/api/reportes/ventas",
        params=_DATE_PARAMS,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_get_reporte_cobranza(client, vendedor_token):
    resp = client.get(
        "/api/reportes/cobranza",
        params=_DATE_PARAMS,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_cannot_get_reporte_inventario(client, vendedor_token):
    resp = client.get(
        "/api/reportes/inventario",
        params=_DATE_PARAMS,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


# Verify admin and subadmin still pass through (no regression)

def test_admin_can_get_cobranza_dashboard(client, admin_token):
    resp = client.get(
        "/api/cobranza/dashboard",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200


def test_admin_can_list_notas_credito(client, admin_token):
    resp = client.get(
        "/api/dte/notas-credito/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200


def test_subadmin_can_get_reporte_ventas(client, subadmin_token):
    resp = client.get(
        "/api/reportes/ventas",
        params=_DATE_PARAMS,
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert resp.status_code == 200
