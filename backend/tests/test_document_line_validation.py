"""
Tests: validaciones de líneas en schemas de documentos (Pydantic Field).
- cantidad > 0, valor_neto/precio_unitario >= 0 en factura/NV/cotización/boleta.
- descuento_pct de boleta acotado a 0..100.
Todas estas violaciones deben producir 422 (validación de schema, antes del handler).
"""

import random


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_cliente(client, token, nombre=None):
    r = client.post(
        "/api/clientes/",
        json={"nombre": nombre or f"Cliente-Val-{random.randint(1, 99999)}"},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


# ── Factura ─────────────────────────────────────────────────────────────────────


def test_factura_linea_cantidad_cero_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/facturas/",
        json={
            "cliente_id": cliente["id"],
            "lineas": [{"orden": 0, "descripcion": "Item", "cantidad": 0, "valor_neto": 1000}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


def test_factura_linea_valor_negativo_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/facturas/",
        json={
            "cliente_id": cliente["id"],
            "lineas": [{"orden": 0, "descripcion": "Item", "cantidad": 1, "valor_neto": -100}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


# ── Nota de venta ─────────────────────────────────────────────────────────────────


def test_nota_venta_linea_cantidad_negativa_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente["id"],
            "lineas": [{"orden": 0, "descripcion": "Item", "cantidad": -1, "valor_neto": 1000}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


# ── Cotización ────────────────────────────────────────────────────────────────────


def test_cotizacion_linea_valor_negativo_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": cliente["id"],
            "lineas": [{"orden": 0, "descripcion": "Item", "cantidad": 1, "valor_neto": -1}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


def test_cotizacion_linea_cantidad_negativa_422(client, admin_token):
    # cantidad=0 está permitido (centinela de recotizar para producto descontinuado);
    # cantidad negativa sigue siendo rechazada (ge=0).
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": cliente["id"],
            "lineas": [{"orden": 0, "descripcion": "Item", "cantidad": -1, "valor_neto": 1000}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


# ── Boleta ────────────────────────────────────────────────────────────────────────


def test_boleta_descuento_pct_mayor_100_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "39",
            "metodo_pago": "efectivo",
            "cliente_id": cliente["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000", "descuento_pct": "150"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


def test_boleta_descuento_pct_negativo_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "39",
            "metodo_pago": "efectivo",
            "cliente_id": cliente["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000", "descuento_pct": "-5"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


def test_boleta_linea_cantidad_cero_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "39",
            "metodo_pago": "efectivo",
            "cliente_id": cliente["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "0", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text
