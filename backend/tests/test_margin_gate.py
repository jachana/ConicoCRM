import pytest


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_producto(client, token, precio_venta=1000, precio_costo=600):
    r = client.post("/api/productos/", json={
        "nombre": "Prod Gate Test",
        "sku": "SKU-GATE-01",
        "precio_venta": precio_venta,
        "precio_costo": precio_costo,
        "unidad": "un",
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _make_cliente(client, token):
    r = client.post("/api/clientes/", json={"nombre": "Cliente Gate"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()["id"]


def _make_cotizacion(client, token, cliente_id, producto_id, valor_neto):
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cliente_id,
        "lineas": [{"orden": 1, "descripcion": "Prod Gate Test",
                    "producto_id": producto_id, "cantidad": 1, "valor_neto": valor_neto}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _approve(client, token, cotizacion_id, linea_id, valor_neto):
    r = client.post("/api/aprobaciones_margen/", json={
        "cotizacion_id": cotizacion_id,
        "lineas_propuestas": [{"linea_id": linea_id, "descripcion": "Prod Gate Test",
            "valor_neto_actual": valor_neto, "margen_actual": 0.25,
            "valor_neto_propuesto": valor_neto, "margen_propuesto": 0.25}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    aprobacion_id = r.json()["id"]
    r2 = client.patch(f"/api/aprobaciones_margen/{aprobacion_id}",
                      json={"accion": "aprobar"},
                      headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200, r2.text
    return aprobacion_id


# ── margin-status ─────────────────────────────────────────────────────────────

def test_margin_status_no_deviation(client, admin_token):
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=1000)
    r = client.get(f"/api/cotizaciones/{cot['id']}/margin-status",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["blocked"] is False


def test_margin_status_deviation_no_approval(client, admin_token):
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/margin-status",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["blocked"] is True
    assert data["estado"] is None
    assert data["aprobacion_id"] is None


def test_margin_status_approved(client, admin_token):
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    aprobacion_id = _approve(client, admin_token, cot["id"], linea_id, 800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/margin-status",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["blocked"] is False
    assert data["estado"] == "aprobada"
    assert data["aprobacion_id"] == aprobacion_id
