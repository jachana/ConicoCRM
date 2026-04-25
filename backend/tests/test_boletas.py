import os
import random
import threading
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


@patch("app.api.boletas.emit_dte")
def test_listar_filtra_por_patente(mock_emit, client, admin_token):
    client.post("/api/boletas/", json={
        "tipo_dte": "39", "metodo_pago": "efectivo", "patente_vehiculo": "XYZ99",
        "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/boletas/", json={
        "tipo_dte": "39", "metodo_pago": "efectivo", "patente_vehiculo": "ABC11",
        "lineas": [{"orden": 0, "descripcion": "y", "cantidad": "1", "precio_unitario": "200"}],
    }, headers={"Authorization": f"Bearer {admin_token}"})

    r = client.get("/api/boletas/?patente=xyz99", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["patente_vehiculo"] == "XYZ99"


@patch("app.api.boletas.emit_dte")
def test_detalle_devuelve_lineas(mock_emit, client, admin_token):
    r = client.post("/api/boletas/", json={
        "tipo_dte": "39", "metodo_pago": "efectivo",
        "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    bid = r.json()["id"]
    r2 = client.get(f"/api/boletas/{bid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert len(r2.json()["lineas"]) == 1


@patch("app.api.boletas.emit_dte")
def test_patch_actualiza_email_y_patente(mock_emit, client, admin_token):
    r = client.post("/api/boletas/", json={
        "tipo_dte": "39", "metodo_pago": "efectivo",
        "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    bid = r.json()["id"]
    r2 = client.patch(
        f"/api/boletas/{bid}",
        json={"email_envio": "x@y.cl", "patente_vehiculo": "PP-22"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["email_envio"] == "x@y.cl"
    assert r2.json()["patente_vehiculo"] == "PP22"


@patch("app.api.boletas.emit_dte")
def test_patch_bloqueado_si_dte_aceptada(mock_emit, client, admin_token, db):
    r = client.post("/api/boletas/", json={
        "tipo_dte": "39", "metodo_pago": "efectivo",
        "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    bid = r.json()["id"]
    from app.models.boleta import Boleta
    b = db.get(Boleta, bid)
    b.dte_estado = "aceptada"
    db.commit()

    r2 = client.patch(
        f"/api/boletas/{bid}",
        json={"email_envio": "x@y.cl"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 409


@patch("app.api.boletas.emit_dte")
def test_anular_boleta_genera_nc_y_revierte_stock(mock_emit, client, admin_token, db):
    prod = _create_producto(client, admin_token)
    r = client.post("/api/boletas/", json={
        "tipo_dte": "39", "metodo_pago": "efectivo",
        "lineas": [{"orden": 0, "producto_id": prod["id"], "descripcion": "x", "cantidad": "2", "precio_unitario": "100"}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    bid = r.json()["id"]

    r2 = client.post(
        f"/api/boletas/{bid}/anular",
        json={"razon": "Cliente cambió de opinión"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200, r2.text

    from app.models.boleta import Boleta
    from app.models.nota_credito import NotaCredito
    from app.models.movimiento_inventario import MovimientoInventario

    b = db.get(Boleta, bid)
    db.refresh(b)
    assert b.estado == "anulada"

    nc = db.query(NotaCredito).filter_by(boleta_id=bid).first()
    assert nc is not None
    assert nc.razon.startswith("Cliente")

    movs = db.query(MovimientoInventario).filter_by(referencia_tipo="boleta", referencia_id=bid).all()
    salidas = [m for m in movs if m.signo == -1]
    entradas = [m for m in movs if m.signo == 1]
    assert len(salidas) == 1
    assert len(entradas) == 1


@patch("app.api.boletas.emit_dte")
def test_pdf_endpoint_devuelve_bytes(mock_emit, client, admin_token):
    r = client.post("/api/boletas/", json={
        "tipo_dte": "39", "metodo_pago": "efectivo",
        "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    bid = r.json()["id"]
    r2 = client.get(f"/api/boletas/{bid}/pdf", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.headers["content-type"] == "application/pdf"
    assert r2.content[:4] == b"%PDF"


@patch("app.api.boletas.emit_dte")
@patch("app.api.boletas._enviar_boleta_email")
def test_email_endpoint_marca_timestamp(mock_email, mock_emit, client, admin_token):
    r = client.post("/api/boletas/", json={
        "tipo_dte": "39", "metodo_pago": "efectivo", "email_envio": "x@y.cl",
        "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    bid = r.json()["id"]
    r2 = client.post(
        f"/api/boletas/{bid}/email",
        json={"email": "otro@y.cl"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["email_enviado_at"] is not None
    mock_email.assert_called_once()


@patch("app.api.boletas.emit_dte")
def test_export_excel(mock_emit, client, admin_token):
    client.post("/api/boletas/", json={
        "tipo_dte": "39", "metodo_pago": "efectivo",
        "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/boletas/export/excel", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheet" in r.headers["content-type"]


@pytest.mark.skipif(
    "sqlite" in os.environ.get("DATABASE_URL", "sqlite"),
    reason="row-level lock with_for_update requires Postgres",
)
@patch("app.api.boletas.emit_dte")
def test_numeracion_concurrente_no_duplica(mock_emit, client, admin_token):
    payload = {
        "tipo_dte": "39",
        "metodo_pago": "efectivo",
        "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "100"}],
    }
    headers = {"Authorization": f"Bearer {admin_token}"}
    results: list[int | None] = []
    lock = threading.Lock()

    def crear():
        r = client.post("/api/boletas/", json=payload, headers=headers)
        with lock:
            results.append(r.json().get("numero") if r.status_code == 201 else None)

    threads = [threading.Thread(target=crear) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(results) == 8
    assert all(n is not None for n in results), f"some requests failed: {results}"
    assert len(set(results)) == 8, f"duplicate numero detected: {results}"
