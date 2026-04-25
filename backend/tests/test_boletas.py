import random
from decimal import Decimal
import pytest
from unittest.mock import patch


def _create_producto(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={
            "nombre": "Prod Boleta",
            "sku": f"SKU-BOL-{random.randint(10000, 99999)}",
            "precio_venta": 1190,
            "precio_costo": 600,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


@patch("app.api.boletas.emit_dte")
def test_post_boleta_anonima_crea_emision(mock_emit, client, admin_token):
    prod = _create_producto(client, admin_token)
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "39",
            "metodo_pago": "efectivo",
            "lineas": [
                {"orden": 0, "producto_id": prod["id"], "descripcion": "Item", "cantidad": "2", "precio_unitario": "595"}
            ],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["rut_receptor"] == "66666666-6"
    assert body["nombre_receptor"] in (None, "Consumidor Final")
    assert body["dte_estado"] == "pendiente"
    assert body["total"] == "1190.00"
    mock_emit.delay.assert_called_once()


@patch("app.api.boletas.emit_dte")
def test_post_boleta_descuenta_stock(mock_emit, client, admin_token, db):
    prod = _create_producto(client, admin_token)
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "39",
            "metodo_pago": "efectivo",
            "lineas": [
                {"orden": 0, "producto_id": prod["id"], "descripcion": "Item", "cantidad": "3", "precio_unitario": "100"}
            ],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    boleta_id = r.json()["id"]
    from app.models.movimiento_inventario import MovimientoInventario
    movs = db.query(MovimientoInventario).filter_by(referencia_tipo="boleta", referencia_id=boleta_id).all()
    assert len(movs) == 1
    assert movs[0].cantidad == 3
    assert movs[0].signo == -1


@patch("app.api.boletas.emit_dte")
def test_post_boleta_41_sin_iva(mock_emit, client, admin_token):
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "41",
            "metodo_pago": "efectivo",
            "lineas": [
                {"orden": 0, "descripcion": "Servicio", "cantidad": "1", "precio_unitario": "5000", "exenta": True}
            ],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["total_iva"] == "0.00"
    assert body["total"] == "5000.00"


@patch("app.api.boletas.emit_dte")
def test_post_boleta_normaliza_patente(mock_emit, client, admin_token):
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "39",
            "metodo_pago": "efectivo",
            "patente_vehiculo": "ab cd-12",
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["patente_vehiculo"] == "ABCD12"


def test_post_boleta_lineas_vacias_422(client, admin_token):
    r = client.post(
        "/api/boletas/",
        json={"tipo_dte": "39", "metodo_pago": "efectivo", "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


@patch("app.api.boletas.emit_dte")
def test_post_boleta_41_con_linea_afecta_falla(mock_emit, client, admin_token):
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "41",
            "metodo_pago": "efectivo",
            "lineas": [
                {"orden": 0, "descripcion": "Afecta", "cantidad": "1", "precio_unitario": "100", "exenta": False}
            ],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422
    assert "exent" in r.text.lower()
