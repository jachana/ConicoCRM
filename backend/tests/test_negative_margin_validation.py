import pytest
import random


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_producto(client, token, precio_venta=1000, precio_costo=600):
    r = client.post("/api/productos/", json={
        "nombre": "Prod Validation Test",
        "sku": f"SKU-VAL-{precio_venta}-{precio_costo}-{random.randint(10000, 99999)}",
        "precio_venta": precio_venta,
        "precio_costo": precio_costo,
        "unidad": "un",
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _make_cliente(client, token):
    r = client.post("/api/clientes/", json={"nombre": f"Cliente Val {random.randint(1000, 9999)}"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()["id"]


def _make_cotizacion_linea(client, token, cid, producto_id, valor_neto):
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cid,
        "lineas": [{"orden": 1, "descripcion": "Test", "producto_id": producto_id,
                    "cantidad": 1, "valor_neto": valor_neto}],
    }, headers={"Authorization": f"Bearer {token}"})
    return r


# ── cotizacion save ───────────────────────────────────────────────────────────

def test_cot_save_blocked_negative_margin(client, admin_token):
    # precio_venta=500 < precio_costo=1000 → margen = (500-1000)/500 = -1.0
    prod = _make_producto(client, admin_token, precio_venta=500, precio_costo=1000)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=500)
    assert r.status_code == 422
    assert "margen_negativo" in r.json()["detail"]


def test_cot_save_blocked_empty_item(client, admin_token):
    cid = _make_cliente(client, admin_token)
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cid,
        "lineas": [{"orden": 1, "descripcion": "Texto libre", "producto_id": None,
                    "cantidad": 1, "valor_neto": 1000}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422
    assert "linea_sin_item" in r.json()["detail"]


def test_cot_save_allowed_positive_margin(client, admin_token):
    # precio_venta=1000, precio_costo=600 → margen = (1000-600)/1000 = 0.4
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201


def test_cot_update_lineas_blocked_negative_margin(client, admin_token):
    prod_ok = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    prod_neg = _make_producto(client, admin_token, precio_venta=500, precio_costo=1000)
    cid = _make_cliente(client, admin_token)
    # Create valid cotizacion
    r = _make_cotizacion_linea(client, admin_token, cid, prod_ok["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    # Now update lineas with negative margin
    r2 = client.put(f"/api/cotizaciones/{cot_id}/lineas", json=[
        {"orden": 1, "descripcion": "Test", "producto_id": prod_neg["id"],
         "cantidad": 1, "valor_neto": 500}
    ], headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]


def test_cot_update_lineas_blocked_empty_item(client, admin_token):
    prod_ok = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod_ok["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    r2 = client.put(f"/api/cotizaciones/{cot_id}/lineas", json=[
        {"orden": 1, "descripcion": "Texto libre", "producto_id": None,
         "cantidad": 1, "valor_neto": 1000}
    ], headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "linea_sin_item" in r2.json()["detail"]


def test_cot_save_blocked_both_errors(client, admin_token):
    # One line with negative margin, one line with no item
    prod_neg = _make_producto(client, admin_token, precio_venta=500, precio_costo=1000)
    cid = _make_cliente(client, admin_token)
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cid,
        "lineas": [
            {"orden": 1, "descripcion": "Neg margin", "producto_id": prod_neg["id"],
             "cantidad": 1, "valor_neto": 500},
            {"orden": 2, "descripcion": "No item", "producto_id": None,
             "cantidad": 1, "valor_neto": 1000},
        ],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "margen_negativo" in detail
    assert "linea_sin_item" in detail


# ── cotizacion PDF / email gates ──────────────────────────────────────────────

def test_cot_pdf_blocked_negative_margin(client, db, admin_token):
    from app.models.cotizacion import CotizacionLinea
    from decimal import Decimal
    # Create valid cotizacion via API (passes save validation)
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    # Directly set margen to negative in DB (simulates legacy data)
    linea = db.query(CotizacionLinea).filter(CotizacionLinea.cotizacion_id == cot_id).first()
    linea.margen = Decimal("-0.5")
    db.commit()
    # PDF should be blocked
    r2 = client.get(f"/api/cotizaciones/{cot_id}/pdf",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]


def test_cot_pdf_blocked_empty_item(client, db, admin_token):
    from app.models.cotizacion import CotizacionLinea
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    # Directly nullify producto_id in DB (simulates legacy data)
    linea = db.query(CotizacionLinea).filter(CotizacionLinea.cotizacion_id == cot_id).first()
    linea.producto_id = None
    db.commit()
    r2 = client.get(f"/api/cotizaciones/{cot_id}/pdf",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "linea_sin_item" in r2.json()["detail"]


def test_cot_email_blocked_negative_margin(client, db, admin_token):
    from app.models.cotizacion import CotizacionLinea
    from decimal import Decimal
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_cotizacion_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    cot_id = r.json()["id"]
    linea = db.query(CotizacionLinea).filter(CotizacionLinea.cotizacion_id == cot_id).first()
    linea.margen = Decimal("-0.5")
    db.commit()
    r2 = client.post(f"/api/cotizaciones/{cot_id}/email",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]


# ── nota de venta ─────────────────────────────────────────────────────────────

def _make_nv_linea(client, token, cid, producto_id, valor_neto):
    r = client.post("/api/nota_ventas/", json={
        "cliente_id": cid,
        "retiro_en_conico": True,
        "lineas": [{"orden": 1, "descripcion": "Test NV", "producto_id": producto_id,
                    "cantidad": 1, "valor_neto": valor_neto}],
    }, headers={"Authorization": f"Bearer {token}"})
    return r


def test_nv_save_blocked_negative_margin(client, admin_token):
    prod = _make_producto(client, admin_token, precio_venta=500, precio_costo=1000)
    cid = _make_cliente(client, admin_token)
    r = _make_nv_linea(client, admin_token, cid, prod["id"], valor_neto=500)
    assert r.status_code == 422
    assert "margen_negativo" in r.json()["detail"]


def test_nv_save_blocked_empty_item(client, admin_token):
    cid = _make_cliente(client, admin_token)
    r = client.post("/api/nota_ventas/", json={
        "cliente_id": cid,
        "retiro_en_conico": True,
        "lineas": [{"orden": 1, "descripcion": "Texto libre", "producto_id": None,
                    "cantidad": 1, "valor_neto": 1000}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422
    assert "linea_sin_item" in r.json()["detail"]


def test_nv_update_lineas_blocked_negative_margin(client, admin_token):
    prod_ok = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    prod_neg = _make_producto(client, admin_token, precio_venta=500, precio_costo=1000)
    cid = _make_cliente(client, admin_token)
    r = _make_nv_linea(client, admin_token, cid, prod_ok["id"], valor_neto=1000)
    assert r.status_code == 201
    nv_id = r.json()["id"]
    r2 = client.put(f"/api/nota_ventas/{nv_id}/lineas", json=[
        {"orden": 1, "descripcion": "Test", "producto_id": prod_neg["id"],
         "cantidad": 1, "valor_neto": 500}
    ], headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]


def test_nv_pdf_blocked_negative_margin(client, db, admin_token):
    from app.models.nota_venta import NotaVentaLinea
    from decimal import Decimal
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_nv_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    nv_id = r.json()["id"]
    linea = db.query(NotaVentaLinea).filter(NotaVentaLinea.nv_id == nv_id).first()
    linea.margen = Decimal("-0.5")
    db.commit()
    r2 = client.get(f"/api/nota_ventas/{nv_id}/pdf",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "margen_negativo" in r2.json()["detail"]


def test_nv_email_blocked_empty_item(client, db, admin_token):
    from app.models.nota_venta import NotaVentaLinea
    prod = _make_producto(client, admin_token, precio_venta=1000, precio_costo=600)
    cid = _make_cliente(client, admin_token)
    r = _make_nv_linea(client, admin_token, cid, prod["id"], valor_neto=1000)
    assert r.status_code == 201
    nv_id = r.json()["id"]
    linea = db.query(NotaVentaLinea).filter(NotaVentaLinea.nv_id == nv_id).first()
    linea.producto_id = None
    db.commit()
    r2 = client.post(f"/api/nota_ventas/{nv_id}/email",
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 422
    assert "linea_sin_item" in r2.json()["detail"]
