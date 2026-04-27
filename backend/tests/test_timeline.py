"""
Tests for W2-02 unified timeline endpoint.

Covers:
1. 404 when cliente/empresa doesn't exist
2. Multi-type union per cliente
3. empresa timeline resolves NC via Cliente.empresa_id
4. Filter by tipos query param
5. Invalid tipo → 422
6. Pagination
7. Vendedor sees only own documents
8. Vendedor does NOT see pago/NC/ND
9. Admin sees all
10. 401 without auth (proxy for permission check)
11. Correct link and titulo format
"""

import random
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _rnd_sku():
    return f"SKU-TL-{random.randint(100000, 999999)}"


def _create_empresa(client, token, nombre=None):
    payload = {"nombre": nombre or f"Empresa-{random.randint(1, 9999)}"}
    r = client.post("/api/empresas/", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _create_cliente(client, token, nombre=None, empresa_id=None):
    payload = {"nombre": nombre or f"Cliente-{random.randint(1, 9999)}"}
    if empresa_id:
        payload["empresa_id"] = empresa_id
    r = client.post("/api/clientes/", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _create_producto(client, token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod TL", "sku": _rnd_sku(), "precio_venta": 1000, "precio_costo": 300, "unidad": "un"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_cotizacion(client, token, cliente_id, admin_token=None):
    """admin_token is used to create the product (vendedores can't create products)."""
    prod_token = admin_token or token
    prod = _create_producto(client, prod_token)
    r = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": cliente_id,
            "lineas": [{"orden": 0, "descripcion": "Item", "producto_id": prod["id"], "cantidad": 1, "valor_neto": 1000}],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_nv(client, token, cliente_id):
    r = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": cliente_id, "retiro_en_conico": True, "lineas": []},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_factura(client, token, cliente_id, empresa_id=None):
    payload = {
        "cliente_id": cliente_id,
        "lineas": [{"orden": 0, "descripcion": "Item", "cantidad": 1, "valor_neto": 500}],
    }
    if empresa_id:
        payload["empresa_id"] = empresa_id
    r = client.post("/api/facturas/", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _create_pago(client, token, factura_id):
    r = client.post(
        "/api/pagos/",
        json={"factura_id": factura_id, "fecha": "2026-04-01", "monto": 100, "metodo_pago": "efectivo"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_nota_credito(client, token, cliente_id):
    r = client.post(
        "/api/dte/notas-credito/",
        json={
            "cliente_id": cliente_id,
            "razon": "Devolución test",
            "lineas": [{"orden": 0, "descripcion": "Ítem devuelto", "cantidad": 1, "precio_unitario": 100}],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_nota_debito(client, token, cliente_id):
    r = client.post(
        "/api/dte/notas-debito/",
        json={
            "cliente_id": cliente_id,
            "razon": "Recargo test",
            "lineas": [{"orden": 0, "descripcion": "Recargo", "cantidad": 1, "precio_unitario": 50}],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# 1. 404 — cliente no existe
# ---------------------------------------------------------------------------


def test_timeline_cliente_404_si_no_existe(client, admin_token):
    r = client.get("/api/clientes/99999/timeline", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 2. 404 — empresa no existe
# ---------------------------------------------------------------------------


def test_timeline_empresa_404_si_no_existe(client, admin_token):
    r = client.get("/api/empresas/99999/timeline", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 3. Combina múltiples tipos por cliente
# ---------------------------------------------------------------------------


def test_timeline_cliente_combina_multiples_tipos(client, admin_token):
    c = _create_cliente(client, admin_token, nombre="Multi-Tipo")
    cid = c["id"]

    _create_cotizacion(client, admin_token, cid)
    _create_nv(client, admin_token, cid)
    _create_factura(client, admin_token, cid)

    r = client.get(
        f"/api/clientes/{cid}/timeline?tipos=cotizacion,nota_venta,factura",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3
    tipos_en_items = {item["tipo"] for item in data["items"]}
    assert tipos_en_items == {"cotizacion", "nota_venta", "factura"}


# ---------------------------------------------------------------------------
# 4. empresa timeline: NC via Cliente.empresa_id
# ---------------------------------------------------------------------------


def test_timeline_empresa_combina_via_cliente_para_nc(client, admin_token):
    emp = _create_empresa(client, admin_token, nombre="EmpresaNC")
    eid = emp["id"]

    # Cliente pertenece a la empresa
    c = _create_cliente(client, admin_token, nombre="ClienteDeEmpNC", empresa_id=eid)
    cid = c["id"]

    # NC tiene cliente_id → se resuelve via Cliente.empresa_id == eid
    _create_nota_credito(client, admin_token, cid)

    r = client.get(
        f"/api/empresas/{eid}/timeline?tipos=nota_credito",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"] >= 1
    assert any(item["tipo"] == "nota_credito" for item in data["items"])


# ---------------------------------------------------------------------------
# 5. Filtro por tipos
# ---------------------------------------------------------------------------


def test_timeline_filtra_por_tipos(client, admin_token):
    c = _create_cliente(client, admin_token, nombre="Filtro-Tipos")
    cid = c["id"]

    _create_cotizacion(client, admin_token, cid)
    _create_nv(client, admin_token, cid)
    _create_factura(client, admin_token, cid)

    r = client.get(
        f"/api/clientes/{cid}/timeline?tipos=cotizacion,factura",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    tipos = {item["tipo"] for item in data["items"]}
    assert "nota_venta" not in tipos
    assert data["total"] == 2


# ---------------------------------------------------------------------------
# 6. Tipo inválido → 422
# ---------------------------------------------------------------------------


def test_timeline_tipo_invalido_422(client, admin_token):
    c = _create_cliente(client, admin_token, nombre="Tipo-Invalido")
    cid = c["id"]

    r = client.get(
        f"/api/clientes/{cid}/timeline?tipos=cotizacion,tipo_inventado",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 7. Paginación
# ---------------------------------------------------------------------------


def test_timeline_paginacion(client, admin_token):
    c = _create_cliente(client, admin_token, nombre="Paginacion")
    cid = c["id"]

    # Create 5 cotizaciones
    for _ in range(5):
        _create_cotizacion(client, admin_token, cid)

    # Full list
    r_full = client.get(
        f"/api/clientes/{cid}/timeline?tipos=cotizacion",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r_full.status_code == 200
    full = r_full.json()
    assert full["total"] == 5

    # Page with limit=2 offset=2
    r_page = client.get(
        f"/api/clientes/{cid}/timeline?tipos=cotizacion&limit=2&offset=2",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r_page.status_code == 200
    page = r_page.json()
    assert page["total"] == 5
    assert len(page["items"]) == 2
    assert page["limit"] == 2
    assert page["offset"] == 2


# ---------------------------------------------------------------------------
# 8. Vendedor sólo ve sus propios docs
# ---------------------------------------------------------------------------


def test_timeline_vendedor_solo_ve_propios(client, admin_token, vendedor_token, vendedor_user, db):
    """vendedor_a creates a cotizacion; unrelated vendedor_b requests timeline → 0 items."""
    from app.models.user import User
    from app.core.security import get_password_hash

    vendedor_b = User(
        email="vendedor_b_scope@conico.cl",
        name="Vendedor B Scope",
        hashed_password=get_password_hash("secret123"),
        role="vendedor",
    )
    db.add(vendedor_b)
    db.commit()

    # Login vendedor_b
    resp_b = client.post("/api/auth/login", data={"username": "vendedor_b_scope@conico.cl", "password": "secret123"})
    token_b = resp_b.json()["access_token"]

    # admin creates a cliente; vendedor_a creates a cotizacion for that cliente
    c = _create_cliente(client, admin_token, nombre="ClienteVendedorScope")
    cid = c["id"]
    _create_cotizacion(client, vendedor_token, cid, admin_token=admin_token)

    # vendedor_b requests timeline for that cliente → should see 0 cotizaciones
    r = client.get(
        f"/api/clientes/{cid}/timeline?tipos=cotizacion",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert len(data["items"]) == 0


# ---------------------------------------------------------------------------
# 9. Vendedor no ve pagos, NC, ND
# ---------------------------------------------------------------------------


def test_timeline_vendedor_no_ve_pagos_nc_nd(client, admin_token, vendedor_token):
    c = _create_cliente(client, admin_token, nombre="ClienteNcNdPago")
    cid = c["id"]

    # admin creates NC, ND, and Pago
    _create_nota_credito(client, admin_token, cid)
    _create_nota_debito(client, admin_token, cid)
    factura = _create_factura(client, admin_token, cid)
    _create_pago(client, admin_token, factura["id"])

    r = client.get(
        f"/api/clientes/{cid}/timeline?tipos=nota_credito,nota_debito,pago",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert len(data["items"]) == 0


# ---------------------------------------------------------------------------
# 10. Admin ve todo
# ---------------------------------------------------------------------------


def test_timeline_admin_ve_todo(client, admin_token):
    c = _create_cliente(client, admin_token, nombre="Admin-Ve-Todo")
    cid = c["id"]

    _create_cotizacion(client, admin_token, cid)
    _create_nv(client, admin_token, cid)
    factura = _create_factura(client, admin_token, cid)
    _create_pago(client, admin_token, factura["id"])
    _create_nota_credito(client, admin_token, cid)
    _create_nota_debito(client, admin_token, cid)

    r = client.get(
        f"/api/clientes/{cid}/timeline",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    # At least 6 items (cotizacion + nv + factura + pago + nc + nd)
    assert data["total"] >= 6
    tipos = {item["tipo"] for item in data["items"]}
    assert {"cotizacion", "nota_venta", "factura", "pago", "nota_credito", "nota_debito"}.issubset(tipos)


# ---------------------------------------------------------------------------
# 11. Sin auth → 401
# ---------------------------------------------------------------------------


def test_timeline_sin_permiso_401(client):
    r = client.get("/api/clientes/1/timeline")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# 12. Verifica link y título correctos para cotización y factura
# ---------------------------------------------------------------------------


def test_timeline_link_y_titulo_correctos(client, admin_token):
    c = _create_cliente(client, admin_token, nombre="LinkTitulo")
    cid = c["id"]

    cot = _create_cotizacion(client, admin_token, cid)
    fac = _create_factura(client, admin_token, cid)

    r = client.get(
        f"/api/clientes/{cid}/timeline?tipos=cotizacion,factura",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    items = r.json()["items"]

    cot_item = next(i for i in items if i["tipo"] == "cotizacion")
    fac_item = next(i for i in items if i["tipo"] == "factura")

    assert cot_item["titulo"] == f"Cotización #{cot['id']}"
    assert cot_item["link"] == f"/cotizaciones/{cot['id']}"
    assert fac_item["titulo"] == f"Factura #{fac['id']}"
    assert fac_item["link"] == f"/facturas/{fac['id']}"


# ---------------------------------------------------------------------------
# 13. Regression: boleta anónima NC aparece en empresa timeline
# ---------------------------------------------------------------------------


def test_timeline_empresa_incluye_nc_de_boleta_anonima(client, admin_token, db):
    """NC created via boleta-anulacion path (cliente_id=None, boleta_id=B) must appear
    on the empresa timeline even though there is no Cliente to join through."""
    from decimal import Decimal
    from app.models.boleta import Boleta
    from app.models.empresa import Empresa
    from app.models.nota_credito import NotaCredito

    # Create empresa directly in DB
    emp = Empresa(nombre="EmpresaBoletaAnon")
    db.add(emp)
    db.commit()
    db.refresh(emp)

    # Create boleta with empresa_id set but cliente_id=None (anonymous/walk-in sale)
    boleta = Boleta(
        numero=random.randint(100000, 999999),
        tipo_dte="39",
        cliente_id=None,
        empresa_id=emp.id,
        total=Decimal("1190"),
        total_neto=Decimal("1000"),
        total_iva=Decimal("190"),
        estado="anulada",
    )
    db.add(boleta)
    db.commit()
    db.refresh(boleta)

    # Create NC linked to boleta only (no cliente_id) — simulates boleta-anulacion NC
    nc = NotaCredito(
        numero=random.randint(100000, 999999),
        cliente_id=None,
        boleta_id=boleta.id,
        razon="Anulación boleta anónima",
        monto_total=Decimal("1190"),
        monto_neto=Decimal("1000"),
        monto_iva=Decimal("190"),
    )
    db.add(nc)
    db.commit()
    db.refresh(nc)

    # Verify NC appears on empresa timeline
    r = client.get(
        f"/api/empresas/{emp.id}/timeline?tipos=nota_credito",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"] >= 1, "NC de boleta anónima debe aparecer en timeline empresa"
    nc_ids = [item["id"] for item in data["items"] if item["tipo"] == "nota_credito"]
    assert nc.id in nc_ids, f"NC id={nc.id} no encontrada en items: {data['items']}"
