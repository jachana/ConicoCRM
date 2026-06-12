"""
Tests: NotaCreditoOut expone el documento que la NC rectifica/anula.

NOTA: el modelo NotaCredito NO tiene FK a factura (solo boleta_id y
guia_despacho_id), por lo que la referencia a factura no puede exponerse sin
migración. Estos tests cubren lo disponible: boleta y guía de despacho.
"""

import random
from unittest.mock import patch


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_cliente(client, token, nombre=None):
    r = client.post(
        "/api/clientes/",
        json={"nombre": nombre or f"Cliente-NC-{random.randint(1, 99999)}"},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_guia(client, token):
    r = client.post(
        "/api/guias-despacho/",
        json={
            "motivo_traslado": 1,
            "direccion_destino": "Av. Test 123",
            "comuna_destino": "Santiago",
            "lineas": [{"descripcion": "Item", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_crear_nc_persiste_guia_despacho_id_y_detail_expone_numero(client, admin_token):
    """POST NC con guia_despacho_id la persiste; GET detail expone id + numero de la guía."""
    cliente = _create_cliente(client, admin_token)
    guia = _create_guia(client, admin_token)

    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente["id"],
            "razon": f"Anulación guía despacho N°{guia['numero']}",
            "guia_despacho_id": guia["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 201, r.text
    nc_id = r.json()["id"]
    assert r.json()["guia_despacho_id"] == guia["id"]

    r2 = client.get(f"/api/dte/notas-credito/{nc_id}", headers=_auth(admin_token))
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["guia_despacho_id"] == guia["id"]
    assert body["guia_despacho_numero"] == guia["numero"]
    assert body["boleta_id"] is None
    assert body["boleta_numero"] is None


def test_crear_nc_guia_inexistente_404(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente["id"],
            "razon": "ref rota",
            "guia_despacho_id": 999999,
            "lineas": [],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 404, r.text


@patch("app.api.boletas.emit_dte")
def test_nc_de_boleta_anulada_expone_boleta_id_y_numero(mock_emit, client, admin_token):
    """NC generada al anular boleta → GET detail expone boleta_id + boleta_numero."""
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/boletas/",
        json={
            "tipo_dte": "39",
            "metodo_pago": "efectivo",
            "cliente_id": cliente["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 201, r.text
    boleta = r.json()

    r2 = client.post(
        f"/api/boletas/{boleta['id']}/anular",
        json={"razon": "Cliente devolvió producto"},
        headers=_auth(admin_token),
    )
    assert r2.status_code == 200, r2.text

    # Buscar la NC creada por la anulación
    r3 = client.get("/api/dte/notas-credito/", headers=_auth(admin_token))
    assert r3.status_code == 200, r3.text
    ncs = [nc for nc in r3.json()["data"] if nc.get("boleta_id") == boleta["id"]]
    assert ncs, "no se encontró la NC generada por la anulación de la boleta"

    r4 = client.get(f"/api/dte/notas-credito/{ncs[0]['id']}", headers=_auth(admin_token))
    assert r4.status_code == 200, r4.text
    body = r4.json()
    assert body["boleta_id"] == boleta["id"]
    assert body["boleta_numero"] == boleta["numero"]
