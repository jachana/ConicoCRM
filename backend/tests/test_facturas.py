import pytest
import random
from decimal import Decimal


def _create_cliente(client, admin_token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Cliente Factura", "rut": "11.111.111-1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    return r.json()["id"]


def _create_producto(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={
            "nombre": "Prod Factura Test",
            "sku": f"SKU-FAC-{random.randint(10000, 99999)}",
            "precio_venta": 500,
            "precio_costo": 300,
            "unidad": "un",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_factura(client, admin_token, cliente_id, lineas=None):
    if lineas is None:
        lineas = [{"orden": 0, "descripcion": "Item A", "cantidad": 2, "valor_neto": 1000}]
    r = client.post(
        "/api/facturas/",
        json={"cliente_id": cliente_id, "correo": "test@test.com", "lineas": lineas},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_nv(client, admin_token, cliente_id):
    prod = _create_producto(client, admin_token)
    r = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": cliente_id, "correo": "nv@test.com",
              "lineas": [{"orden": 0, "descripcion": "Prod", "producto_id": prod["id"],
                          "cantidad": 1, "valor_neto": 500}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


# --- Auth ---

def test_sin_auth_lista_401(client):
    r = client.get("/api/facturas/")
    assert r.status_code == 401


def test_sin_auth_crear_401(client):
    r = client.post("/api/facturas/", json={})
    assert r.status_code == 401


# --- CRUD básico ---

def test_crear_factura_standalone(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    assert f["numero"] >= 1
    assert f["estado"] == "emitida"
    assert len(f["lineas"]) == 1
    assert float(f["total_neto"]) == pytest.approx(2000.0)
    assert float(f["total_iva"]) == pytest.approx(380.0)
    assert float(f["total"]) == pytest.approx(2380.0)


def test_numero_correlativo(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f1 = _create_factura(client, admin_token, cid)
    f2 = _create_factura(client, admin_token, cid)
    assert f2["numero"] == f1["numero"] + 1


def test_listar_facturas(client, admin_token):
    cid = _create_cliente(client, admin_token)
    _create_factura(client, admin_token, cid)
    r = client.get("/api/facturas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_obtener_factura(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.get(f"/api/facturas/{f['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["id"] == f["id"]


def test_obtener_factura_404(client, admin_token):
    r = client.get("/api/facturas/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


def test_actualizar_header(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}",
        json={"contacto": "Juan Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["contacto"] == "Juan Test"


# --- Desde NV ---

def test_crear_desde_nv_copia_lineas(client, admin_token):
    cid = _create_cliente(client, admin_token)
    nv = _create_nv(client, admin_token, cid)
    r = client.post(
        f"/api/facturas/from_nv/{nv['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nv_id"] == nv["id"]
    assert data["estado"] == "emitida"
    assert len(data["lineas"]) == 1


def test_crear_desde_nv_409_si_ya_tiene_factura(client, admin_token):
    cid = _create_cliente(client, admin_token)
    nv = _create_nv(client, admin_token, cid)
    client.post(
        f"/api/facturas/from_nv/{nv['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r = client.post(
        f"/api/facturas/from_nv/{nv['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 409


def test_nv_expone_factura_id_tras_crear_factura(client, admin_token):
    cid = _create_cliente(client, admin_token)
    nv = _create_nv(client, admin_token, cid)
    r_nv_antes = client.get(f"/api/nota_ventas/{nv['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r_nv_antes.json()["factura_id"] is None

    client.post(f"/api/facturas/from_nv/{nv['id']}", headers={"Authorization": f"Bearer {admin_token}"})

    r_nv_despues = client.get(f"/api/nota_ventas/{nv['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r_nv_despues.json()["factura_id"] is not None


# --- Permisos ---

def test_vendedor_no_puede_crear_factura(client, vendedor_token, admin_token):
    cid = _create_cliente(client, admin_token)
    r = client.post(
        "/api/facturas/",
        json={"cliente_id": cid, "lineas": []},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


def test_vendedor_puede_ver_facturas(client, vendedor_token, admin_token):
    cid = _create_cliente(client, admin_token)
    _create_factura(client, admin_token, cid)
    r = client.get("/api/facturas/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


# --- Líneas ---

def test_subadmin_no_puede_editar_lineas(client, subadmin_token, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.put(
        f"/api/facturas/{f['id']}/lineas",
        json=[{"orden": 0, "descripcion": "Nueva", "cantidad": 1, "valor_neto": 100}],
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert r.status_code == 403


def test_admin_puede_editar_lineas(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.put(
        f"/api/facturas/{f['id']}/lineas",
        json=[{"orden": 0, "descripcion": "Nueva", "cantidad": 3, "valor_neto": 200}],
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["lineas"]) == 1
    assert float(data["total_neto"]) == pytest.approx(600.0)


# --- Estado ---

def test_transicion_invalida_422(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pendiente"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_emitida_a_pagada_requiere_campos(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pagada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_emitida_a_pagada_ok(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pagada", "fecha_pago": "2026-04-18", "monto_pagado": 2380, "metodo_pago": "transferencia"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["estado"] == "pagada"
    assert data["fecha_pago"] == "2026-04-18"
    assert data["metodo_pago"] == "transferencia"


def test_emitida_a_anulada(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "anulada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["estado"] == "anulada"


def test_pagada_a_anulada_solo_admin(client, admin_token, subadmin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pagada", "fecha_pago": "2026-04-18", "monto_pagado": 100, "metodo_pago": "efectivo"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r_sub = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "anulada"},
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert r_sub.status_code == 403

    r_admin = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "anulada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r_admin.status_code == 200


def test_vendedor_no_puede_cambiar_estado(client, admin_token, vendedor_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "anulada"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


# --- Eliminar ---

def test_eliminar_emitida(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.delete(f"/api/facturas/{f['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 204


def test_eliminar_pagada_409(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    client.patch(
        f"/api/facturas/{f['id']}/estado",
        json={"estado": "pagada", "fecha_pago": "2026-04-18", "monto_pagado": 100, "metodo_pago": "efectivo"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r = client.delete(f"/api/facturas/{f['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


# --- PDF / Excel ---

def test_pdf_200(client, admin_token):
    cid = _create_cliente(client, admin_token)
    f = _create_factura(client, admin_token, cid)
    r = client.get(f"/api/facturas/{f['id']}/pdf", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"


def test_excel_export(client, admin_token):
    cid = _create_cliente(client, admin_token)
    _create_factura(client, admin_token, cid)
    r = client.get("/api/facturas/export/excel", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]


def test_import_xml_bulk_empresa_not_found_returns_empresa_data(client, admin_token):
    xml = b"""<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
  <Documento ID="DTE-33-99999">
    <Encabezado>
      <IdDoc>
        <TipoDTE>33</TipoDTE>
        <Folio>99999</Folio>
        <FchEmis>2024-01-15</FchEmis>
      </IdDoc>
      <Emisor><RUTEmisor>11111111-1</RUTEmisor></Emisor>
      <Receptor>
        <RUTRecep>99999999-9</RUTRecep>
        <RznSocRecep>Empresa Fantasma S.A.</RznSocRecep>
        <CorreoRecep>fantasma@test.cl</CorreoRecep>
      </Receptor>
      <Totales>
        <MntNeto>1000</MntNeto>
        <TasaIVA>19</TasaIVA>
        <IVA>190</IVA>
        <MntTotal>1190</MntTotal>
      </Totales>
      <Detalle>
        <NroLinDet>1</NroLinDet>
        <NmbItem>Item</NmbItem>
        <QtyItem>1</QtyItem>
        <PrcItem>1000</PrcItem>
        <MontoItem>1000</MontoItem>
      </Detalle>
    </Encabezado>
  </Documento>
</DTE>"""
    files = [("files", ("test.xml", xml, "application/xml"))]
    resp = client.post(
        "/api/facturas/import/xml/bulk",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["creadas"] == 0
    assert len(data["errores"]) == 1
    error = data["errores"][0]
    assert "99999999-9" in error["message"]
    assert error["empresa_data"] is not None
    assert error["empresa_data"]["rut"] == "99999999-9"
    assert error["empresa_data"]["nombre"] == "Empresa Fantasma S.A."
    assert error["empresa_data"]["email"] == "fantasma@test.cl"
