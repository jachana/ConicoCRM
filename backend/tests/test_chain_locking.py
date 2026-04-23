import pytest
import random

def _make_cliente(client, token):
    r = client.post("/api/clientes/", json={"nombre": "Lock Test Cliente"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()["id"]


def _make_producto(client, token):
    r = client.post("/api/productos/", json={
        "nombre": "Lock Prod",
        "sku": f"LOCK-{random.randint(10000, 99999)}",
        "precio_venta": 1000,
        "precio_costo": 300,
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()


def _make_cotizacion(client, token, cliente_id, prod_id):
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cliente_id,
        "lineas": [{"orden": 1, "descripcion": "Ítem", "producto_id": prod_id,
                    "cantidad": 1, "valor_neto": 1000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()


def _make_nv_from_cot(client, token, cot_id):
    r = client.post(f"/api/nota_ventas/from_cotizacion/{cot_id}",
                    json={"retiro_en_conico": True},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _make_nv(client, token, cliente_id):
    r = client.post("/api/nota_ventas/", json={
        "cliente_id": cliente_id,
        "retiro_en_conico": True,
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()


def _make_factura_from_nv(client, token, nv_id):
    r = client.post(f"/api/facturas/from_nv/{nv_id}",
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


# ── Cotizacion locking ────────────────────────────────────────────────────────

def test_creating_nv_from_cotizacion_locks_cotizacion(client, admin_token):
    cid = _make_cliente(client, admin_token)
    prod = _make_producto(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"])
    assert cot["is_locked"] is False

    _make_nv_from_cot(client, admin_token, cot["id"])

    r = client.get(f"/api/cotizaciones/{cot['id']}",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.json()["is_locked"] is True


def test_patch_locked_cotizacion_returns_403(client, admin_token):
    cid = _make_cliente(client, admin_token)
    prod = _make_producto(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"])
    _make_nv_from_cot(client, admin_token, cot["id"])

    r = client.patch(f"/api/cotizaciones/{cot['id']}",
                     json={"nota": "intento editar"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 403


def test_put_lineas_locked_cotizacion_returns_403(client, admin_token):
    cid = _make_cliente(client, admin_token)
    prod = _make_producto(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"])
    _make_nv_from_cot(client, admin_token, cot["id"])

    r = client.put(f"/api/cotizaciones/{cot['id']}/lineas",
                   json=[{"orden": 1, "descripcion": "X", "cantidad": 1, "valor_neto": 500}],
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 403


def test_unlocked_cotizacion_is_still_editable(client, admin_token):
    cid = _make_cliente(client, admin_token)
    prod = _make_producto(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"])

    r = client.patch(f"/api/cotizaciones/{cot['id']}",
                     json={"nota": "edición válida"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
