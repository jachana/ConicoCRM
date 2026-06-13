"""
Tests: NotaCreditoOut/NotaDebitoOut exponen el documento que la NC/ND
rectifica/anula: boleta, guía de despacho o factura (factura_id + numero).
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


def _create_guia(client, token, cliente_id=None):
    body = {
        "motivo_traslado": 1,
        "direccion_destino": "Av. Test 123",
        "comuna_destino": "Santiago",
        "lineas": [{"descripcion": "Item", "cantidad": "1", "precio_unitario": "1000"}],
    }
    if cliente_id is not None:
        body["cliente_id"] = cliente_id
    r = client.post("/api/guias-despacho/", json=body, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def _create_factura(client, token, cliente_id):
    r = client.post(
        "/api/facturas/",
        json={
            "cliente_id": cliente_id,
            "correo": "test@test.com",
            "lineas": [{"orden": 0, "descripcion": "Item A", "cantidad": 1, "valor_neto": 1000}],
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
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
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


# ── Referencia a factura (NC) ──────────────────────────────────────────────────

def test_crear_nc_persiste_factura_id_y_detail_expone_numero(client, admin_token):
    """POST NC con factura_id la persiste; GET detail expone id + numero de la factura."""
    cliente = _create_cliente(client, admin_token)
    factura = _create_factura(client, admin_token, cliente["id"])

    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente["id"],
            "razon": f"Rectifica factura N°{factura['numero']}",
            "factura_id": factura["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 201, r.text
    nc_id = r.json()["id"]
    assert r.json()["factura_id"] == factura["id"]

    r2 = client.get(f"/api/dte/notas-credito/{nc_id}", headers=_auth(admin_token))
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["factura_id"] == factura["id"]
    assert body["factura_numero"] == factura["numero"]
    assert body["boleta_id"] is None
    assert body["guia_despacho_id"] is None


def test_crear_nc_factura_inexistente_404(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente["id"],
            "razon": "ref rota",
            "factura_id": 999999,
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 404, r.text


def test_crear_nc_factura_y_guia_422_xor(client, admin_token):
    """Una NC anula UNA cosa: factura_id XOR guia_despacho_id → 422."""
    cliente = _create_cliente(client, admin_token)
    factura = _create_factura(client, admin_token, cliente["id"])
    guia = _create_guia(client, admin_token)

    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente["id"],
            "razon": "doble referencia",
            "factura_id": factura["id"],
            "guia_despacho_id": guia["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


# ── Referencia a factura (ND) ──────────────────────────────────────────────────

def test_crear_nd_persiste_factura_id_y_detail_expone_numero(client, admin_token):
    """POST ND con factura_id la persiste; GET detail expone id + numero de la factura."""
    cliente = _create_cliente(client, admin_token)
    factura = _create_factura(client, admin_token, cliente["id"])

    r = client.post(
        "/api/dte/notas-debito/",
        json={
            "cliente_id": cliente["id"],
            "razon": f"Rectifica factura N°{factura['numero']}",
            "factura_id": factura["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 201, r.text
    nd_id = r.json()["id"]
    assert r.json()["factura_id"] == factura["id"]

    r2 = client.get(f"/api/dte/notas-debito/{nd_id}", headers=_auth(admin_token))
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["factura_id"] == factura["id"]
    assert body["factura_numero"] == factura["numero"]


def test_crear_nd_factura_inexistente_404(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/dte/notas-debito/",
        json={
            "cliente_id": cliente["id"],
            "razon": "ref rota",
            "factura_id": 999999,
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 404, r.text


# ── Validaciones de líneas y referencia-cliente (NC/ND) ─────────────────────────


def test_crear_nc_sin_lineas_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    factura = _create_factura(client, admin_token, cliente["id"])
    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente["id"],
            "razon": "sin lineas",
            "factura_id": factura["id"],
            "lineas": [],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


def test_crear_nd_sin_lineas_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    r = client.post(
        "/api/dte/notas-debito/",
        json={
            "cliente_id": cliente["id"],
            "razon": "sin lineas",
            "lineas": [],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


def test_crear_nc_factura_de_otro_cliente_422(client, admin_token):
    cliente_a = _create_cliente(client, admin_token, nombre="Cliente A")
    factura = _create_factura(client, admin_token, cliente_a["id"])
    cliente_b = _create_cliente(client, admin_token, nombre="Cliente B")
    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente_b["id"],
            "razon": "factura de otro cliente",
            "factura_id": factura["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


def test_crear_nc_guia_de_otro_cliente_422(client, admin_token):
    cliente_a = _create_cliente(client, admin_token, nombre="Cliente A")
    guia = _create_guia(client, admin_token, cliente_id=cliente_a["id"])
    cliente_b = _create_cliente(client, admin_token, nombre="Cliente B")
    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente_b["id"],
            "razon": "guía de otro cliente",
            "guia_despacho_id": guia["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


def test_crear_nd_factura_de_otro_cliente_422(client, admin_token):
    cliente_a = _create_cliente(client, admin_token, nombre="Cliente A")
    factura = _create_factura(client, admin_token, cliente_a["id"])
    cliente_b = _create_cliente(client, admin_token, nombre="Cliente B")
    r = client.post(
        "/api/dte/notas-debito/",
        json={
            "cliente_id": cliente_b["id"],
            "razon": "factura de otro cliente",
            "factura_id": factura["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text


def test_crear_nc_linea_cantidad_negativa_422(client, admin_token):
    cliente = _create_cliente(client, admin_token)
    factura = _create_factura(client, admin_token, cliente["id"])
    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente["id"],
            "razon": "cantidad negativa",
            "factura_id": factura["id"],
            "lineas": [{"orden": 0, "descripcion": "x", "cantidad": "-1", "precio_unitario": "1000"}],
        },
        headers=_auth(admin_token),
    )
    assert r.status_code == 422, r.text
