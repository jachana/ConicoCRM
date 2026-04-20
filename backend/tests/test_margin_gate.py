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


# ── PDF gate ──────────────────────────────────────────────────────────────────

def test_pdf_blocked_when_deviation(client, admin_token, vendedor_token):
    """Non-admin with modified price → PDF 403."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403
    assert "aprobaci" in r.json()["detail"].lower()


def test_pdf_allowed_at_catalog_price(client, admin_token, vendedor_token):
    """Catalog price → PDF 200."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=1000)
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_pdf_allowed_after_approval(client, admin_token, vendedor_token):
    """Approved aprobacion → PDF 200."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    _approve(client, admin_token, cot["id"], linea_id, 800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_pdf_admin_bypasses_gate(client, admin_token):
    """Admin can always generate PDF regardless of deviations."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ── Email gate ────────────────────────────────────────────────────────────────

def test_email_blocked_when_deviation(client, admin_token, vendedor_token):
    """Non-admin with modified price → email 403."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.post(f"/api/cotizaciones/{cot['id']}/email",
                    headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403
    assert "aprobaci" in r.json()["detail"].lower()


def test_email_admin_bypasses_gate(client, admin_token):
    """Admin can always send email regardless of deviations."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    r = client.post(f"/api/cotizaciones/{cot['id']}/email",
                    headers={"Authorization": f"Bearer {admin_token}"})
    # 503 = email not configured in test env — that's fine, gate was passed
    assert r.status_code in (200, 503)


# ── revocar ───────────────────────────────────────────────────────────────────

def test_revocar_aprobacion(client, admin_token):
    """Revoking an approved request -> estado becomes revocada."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    aprobacion_id = _approve(client, admin_token, cot["id"], linea_id, 800)
    r = client.patch(f"/api/aprobaciones_margen/{aprobacion_id}",
                     json={"accion": "revocar"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["estado"] == "revocada"


def test_revocar_pendiente_fails(client, admin_token):
    """Cannot revoke a non-approved (pendiente) request."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    r = client.post("/api/aprobaciones_margen/", json={
        "cotizacion_id": cot["id"],
        "lineas_propuestas": [{"linea_id": linea_id, "descripcion": "Prod Gate Test",
            "valor_neto_actual": 800, "margen_actual": 0.25,
            "valor_neto_propuesto": 800, "margen_propuesto": 0.25}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201, r.text
    aprobacion_id = r.json()["id"]
    r = client.patch(f"/api/aprobaciones_margen/{aprobacion_id}",
                     json={"accion": "revocar"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


def test_pdf_blocked_after_revocar(client, admin_token, vendedor_token):
    """Revoked approval -> PDF blocked again."""
    prod = _make_producto(client, admin_token, precio_venta=1000)
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid, prod["id"], valor_neto=800)
    linea_id = cot["lineas"][0]["id"]
    aprobacion_id = _approve(client, admin_token, cot["id"], linea_id, 800)
    client.patch(f"/api/aprobaciones_margen/{aprobacion_id}",
                 json={"accion": "revocar"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/cotizaciones/{cot['id']}/pdf",
                   headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403
