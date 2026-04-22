import pytest
import random

# ── helpers ──────────────────────────────────────────────────────────────────

def _make_producto(client, token):
    r = client.post("/api/productos/", json={
        "nombre": "Prod NV Test",
        "sku": f"SKU-NV-{random.randint(10000, 99999)}",
        "precio_venta": 1000,
        "precio_costo": 300,
        "unidad": "un",
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _make_cliente(client, token):
    r = client.post("/api/clientes/", json={"nombre": "Cliente NV Test"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()["id"]


def _make_cotizacion(client, token, cliente_id):
    prod = _make_producto(client, token)
    r = client.post("/api/cotizaciones/", json={
        "cliente_id": cliente_id,
        "lineas": [{"orden": 1, "descripcion": "Prod A", "producto_id": prod["id"],
                    "cantidad": 2, "valor_neto": 1000}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    return r.json()


def _create_nv(client, token, cliente_id, **extra):
    payload = {"cliente_id": cliente_id, "retiro_en_conico": True, **extra}
    return client.post("/api/nota_ventas/", json=payload,
                       headers={"Authorization": f"Bearer {token}"})


# ── auth ─────────────────────────────────────────────────────────────────────

def test_listar_sin_auth(client):
    assert client.get("/api/nota_ventas/").status_code == 401


def test_crear_sin_auth(client):
    assert client.post("/api/nota_ventas/", json={"cliente_id": 1}).status_code == 401


# ── crear desde cero ──────────────────────────────────────────────────────────

def test_crear_nv_admin(client, admin_token):
    prod = _make_producto(client, admin_token)
    cid = _make_cliente(client, admin_token)
    r = _create_nv(client, admin_token, cid,
                   lineas=[{"orden": 1, "descripcion": "Artículo", "producto_id": prod["id"],
                             "cantidad": 1, "valor_neto": 500}])
    assert r.status_code == 201
    data = r.json()
    assert data["numero"] >= 1
    assert data["estado"] == "pendiente"
    assert len(data["lineas"]) == 1
    assert float(data["total_neto"]) == 500
    assert float(data["total_iva"]) == pytest.approx(95, rel=0.01)
    assert float(data["total"]) == pytest.approx(595, rel=0.01)


def test_crear_nv_vendedor(client, vendedor_token):
    cid = _make_cliente(client, vendedor_token)
    r = _create_nv(client, vendedor_token, cid)
    assert r.status_code == 201


def test_numeros_son_consecutivos(client, admin_token):
    cid = _make_cliente(client, admin_token)
    r1 = _create_nv(client, admin_token, cid)
    r2 = _create_nv(client, admin_token, cid)
    assert r2.json()["numero"] == r1.json()["numero"] + 1


# ── crear desde cotización ───────────────────────────────────────────────────

def test_crear_nv_desde_cotizacion(client, admin_token):
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid)
    r = client.post(f"/api/nota_ventas/from_cotizacion/{cot['id']}",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201
    nv = r.json()
    assert nv["cotizacion_id"] == cot["id"]
    assert len(nv["lineas"]) == 1
    assert nv["lineas"][0]["descripcion"] == "Prod A"
    assert nv["lineas"][0]["cantidad"] == 2
    assert float(nv["lineas"][0]["valor_neto"]) == 1000


def test_crear_nv_desde_cotizacion_cierra_cotizacion(client, admin_token):
    cid = _make_cliente(client, admin_token)
    cot = _make_cotizacion(client, admin_token, cid)
    client.post(f"/api/nota_ventas/from_cotizacion/{cot['id']}",
                headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/cotizaciones/{cot['id']}",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.json()["estado"] == "cerrada_fv"


def test_crear_nv_desde_cotizacion_404(client, admin_token):
    r = client.post("/api/nota_ventas/from_cotizacion/9999",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


# ── listar ────────────────────────────────────────────────────────────────────

def test_listar_nvs(client, admin_token):
    cid = _make_cliente(client, admin_token)
    _create_nv(client, admin_token, cid)
    r = client.get("/api/nota_ventas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_filtrar_por_estado(client, admin_token):
    cid = _make_cliente(client, admin_token)
    _create_nv(client, admin_token, cid)
    r = client.get("/api/nota_ventas/?estado=pendiente",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    for nv in r.json():
        assert nv["estado"] == "pendiente"


# ── obtener ───────────────────────────────────────────────────────────────────

def test_obtener_nv(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.get(f"/api/nota_ventas/{nv_id}",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["id"] == nv_id


def test_obtener_nv_404(client, admin_token):
    r = client.get("/api/nota_ventas/9999",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


# ── actualizar header ─────────────────────────────────────────────────────────

def test_actualizar_header(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}",
                     json={"contacto": "Juan Pérez", "correo": "juan@test.cl"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["contacto"] == "Juan Pérez"


def test_vendedor_no_puede_editar_nv_ajena(client, admin_token, vendedor_token, vendedor_user):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}",
                     json={"contacto": "Hack"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403


def test_vendedor_puede_editar_nv_propia(client, admin_token, vendedor_token, vendedor_user):
    cid = _make_cliente(client, vendedor_token)
    nv_id = _create_nv(client, vendedor_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}",
                     json={"contacto": "Yo mismo"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


# ── reemplazar líneas ─────────────────────────────────────────────────────────

def test_reemplazar_lineas_recalcula_totales(client, admin_token):
    # Use a cheap product so valor_neto=200 still yields positive margin
    prod = client.post("/api/productos/", json={
        "nombre": "Prod Cheap",
        "sku": f"SKU-CHEAP-{random.randint(10000, 99999)}",
        "precio_venta": 200,
        "precio_costo": 100,
        "unidad": "un",
    }, headers={"Authorization": f"Bearer {admin_token}"}).json()
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid,
                       lineas=[{"orden": 1, "descripcion": "X", "producto_id": prod["id"],
                                "cantidad": 1, "valor_neto": 200}]
                       ).json()["id"]
    r = client.put(f"/api/nota_ventas/{nv_id}/lineas",
                   json=[{"orden": 1, "descripcion": "Y", "producto_id": prod["id"],
                          "cantidad": 3, "valor_neto": 200}],
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert float(data["total_neto"]) == 600
    assert float(data["total_iva"]) == pytest.approx(114, rel=0.01)
    assert float(data["total"]) == pytest.approx(714, rel=0.01)


# ── cambio de estado ──────────────────────────────────────────────────────────

def test_admin_puede_despachar(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "despachada"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["estado"] == "despachada"


def test_vendedor_puede_despachar(client, vendedor_token):
    cid = _make_cliente(client, vendedor_token)
    nv_id = _create_nv(client, vendedor_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "despachada"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_no_puede_pagar(client, admin_token, vendedor_token, vendedor_user):
    cid = _make_cliente(client, vendedor_token)
    nv = _create_nv(client, vendedor_token, cid).json()
    client.patch(f"/api/nota_ventas/{nv['id']}/estado",
                 json={"estado": "despachada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    client.patch(f"/api/nota_ventas/{nv['id']}/estado",
                 json={"estado": "entregada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    r = client.patch(f"/api/nota_ventas/{nv['id']}/estado",
                     json={"estado": "pagada"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403


def test_admin_puede_pagar(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    client.patch(f"/api/nota_ventas/{nv_id}/estado",
                 json={"estado": "despachada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    client.patch(f"/api/nota_ventas/{nv_id}/estado",
                 json={"estado": "entregada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "pagada"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["estado"] == "pagada"


def test_vendedor_no_puede_cancelar(client, vendedor_token):
    cid = _make_cliente(client, vendedor_token)
    nv_id = _create_nv(client, vendedor_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "cancelada"},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403


def test_transicion_invalida_retorna_422(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "pagada"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422


# ── eliminar ──────────────────────────────────────────────────────────────────

def test_eliminar_nv_pendiente(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.delete(f"/api/nota_ventas/{nv_id}",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 204


def test_eliminar_nv_despachada_falla(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    client.patch(f"/api/nota_ventas/{nv_id}/estado",
                 json={"estado": "despachada"},
                 headers={"Authorization": f"Bearer {admin_token}"})
    r = client.delete(f"/api/nota_ventas/{nv_id}",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


# ── pdf ───────────────────────────────────────────────────────────────────────

def test_pdf_retorna_bytes(client, admin_token):
    cid = _make_cliente(client, admin_token)
    nv_id = _create_nv(client, admin_token, cid).json()["id"]
    r = client.get(f"/api/nota_ventas/{nv_id}/pdf",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"


# ── excel ─────────────────────────────────────────────────────────────────────

def test_excel_export(client, admin_token):
    cid = _make_cliente(client, admin_token)
    _create_nv(client, admin_token, cid)
    r = client.get("/api/nota_ventas/export/excel",
                   headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
