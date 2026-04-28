"""Tests for the /recotizar endpoints (cotizacion, NV, factura)."""
import pytest
from decimal import Decimal


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _setup(db):
    """Create minimal fixtures: cliente, vendedor (admin), producto."""
    from app.models.cliente import Cliente
    from app.models.user import User
    from app.models.producto import Producto
    from app.core.security import get_password_hash

    c = Cliente(nombre="Cliente Recotizar")
    u = User(email="v@recot.cl", name="V", hashed_password=get_password_hash("x"), role="admin")
    p = Producto(nombre="Prod A", sku="RCT-001", precio_costo=Decimal("50"), precio_venta=Decimal("100"))
    db.add_all([c, u, p])
    db.commit()
    for obj in [c, u, p]:
        db.refresh(obj)
    return c, u, p


def _create_cotizacion(client, token, cliente_id, vendedor_id, lineas):
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": cliente_id, "vendedor_id": vendedor_id, "lineas": lineas},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Cotizacion tests
# ---------------------------------------------------------------------------

def test_recotizar_cotizacion_actualiza_precios(client, admin_token, db):
    """Re-quoting a cotizacion picks up the current producto.precio_venta."""
    c, u, p = _setup(db)

    # Create original cotizacion with old price
    cot = _create_cotizacion(
        client, admin_token, c.id, u.id,
        [{"orden": 1, "producto_id": p.id, "descripcion": "Prod A", "cantidad": 2, "valor_neto": 100}],
    )

    # Change product price
    p.precio_venta = Decimal("200")
    db.add(p)
    db.commit()

    resp = client.post(
        f"/api/cotizaciones/{cot['id']}/recotizar",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["warnings"] == []
    new_id = data["id"]
    assert new_id != cot["id"]

    # Fetch the new cotizacion and verify updated price
    detail = client.get(
        f"/api/cotizaciones/{new_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert detail.status_code == 200
    linea = detail.json()["lineas"][0]
    assert float(linea["valor_neto"]) == pytest.approx(200.0)
    assert linea["cantidad"] == 2


def test_recotizar_producto_descontinuado(client, admin_token, db):
    """Re-quoting when a product was deleted → cantidad=0 and SKU in warnings."""
    c, u, p = _setup(db)
    prod_id = p.id
    prod_sku = p.sku

    cot = _create_cotizacion(
        client, admin_token, c.id, u.id,
        [{"orden": 1, "producto_id": p.id, "descripcion": "Prod A", "sku": prod_sku, "cantidad": 3, "valor_neto": 100}],
    )

    # Delete the product (simulate discontinued)
    db.delete(p)
    db.commit()

    resp = client.post(
        f"/api/cotizaciones/{cot['id']}/recotizar",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert prod_sku in data["warnings"]
    new_id = data["id"]

    detail = client.get(
        f"/api/cotizaciones/{new_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert detail.status_code == 200
    linea = detail.json()["lineas"][0]
    assert linea["cantidad"] == 0


def test_recotizar_cotizacion_not_found(client, admin_token, db):
    resp = client.post(
        "/api/cotizaciones/99999/recotizar",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_recotizar_cotizacion_linea_sin_producto(client, admin_token, db):
    """Lines without producto_id are copied as-is."""
    from app.models.cotizacion import Cotizacion, CotizacionLinea

    c, u, p = _setup(db)

    # Create cotizacion directly in DB (API rejects lines without producto_id)
    cot = Cotizacion(
        numero=99001,
        cliente_id=c.id,
        vendedor_id=u.id,
        fecha=__import__("datetime").date.today(),
        estado="no_definido",
        validez_dias=5,
        total_neto=Decimal("500"),
        total_iva=Decimal("95"),
        total=Decimal("595"),
    )
    db.add(cot)
    db.flush()
    linea = CotizacionLinea(
        cotizacion_id=cot.id,
        orden=1,
        producto_id=None,
        descripcion="Servicio",
        cantidad=1,
        valor_neto=Decimal("500"),
        descuento=Decimal("0"),
        total_neto=Decimal("500"),
        iva=Decimal("95"),
        total=Decimal("595"),
    )
    db.add(linea)
    db.commit()
    db.refresh(cot)

    resp = client.post(
        f"/api/cotizaciones/{cot.id}/recotizar",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["warnings"] == []

    detail = client.get(
        f"/api/cotizaciones/{data['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    linea_out = detail.json()["lineas"][0]
    assert float(linea_out["valor_neto"]) == pytest.approx(500.0)
    assert linea_out["cantidad"] == 1


# ---------------------------------------------------------------------------
# NotaVenta test
# ---------------------------------------------------------------------------

def test_recotizar_nv(client, admin_token, db):
    """Re-quoting from an NV creates a cotizacion with updated prices."""
    c, u, p = _setup(db)

    # Create NV via API
    nv_resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": c.id,
            "vendedor_id": u.id,
            "lineas": [{"orden": 1, "producto_id": p.id, "descripcion": "Prod A", "cantidad": 1, "valor_neto": 100}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert nv_resp.status_code == 201, nv_resp.text
    nv_id = nv_resp.json()["id"]

    # Update product price
    p.precio_venta = Decimal("150")
    db.add(p)
    db.commit()

    resp = client.post(
        f"/api/nota_ventas/{nv_id}/recotizar",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["warnings"] == []

    detail = client.get(
        f"/api/cotizaciones/{data['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    linea = detail.json()["lineas"][0]
    assert float(linea["valor_neto"]) == pytest.approx(150.0)


# ---------------------------------------------------------------------------
# Factura test
# ---------------------------------------------------------------------------

def test_recotizar_factura(client, admin_token, db):
    """Re-quoting from a Factura creates a cotizacion with updated prices."""
    c, u, p = _setup(db)

    # Create Factura via API
    fac_resp = client.post(
        "/api/facturas/",
        json={
            "cliente_id": c.id,
            "vendedor_id": u.id,
            "lineas": [{"orden": 1, "producto_id": p.id, "descripcion": "Prod A", "cantidad": 2, "valor_neto": 100}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert fac_resp.status_code == 201, fac_resp.text
    fac_id = fac_resp.json()["id"]

    # Update product price
    p.precio_venta = Decimal("300")
    db.add(p)
    db.commit()

    resp = client.post(
        f"/api/facturas/{fac_id}/recotizar",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["warnings"] == []

    detail = client.get(
        f"/api/cotizaciones/{data['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    linea = detail.json()["lineas"][0]
    assert float(linea["valor_neto"]) == pytest.approx(300.0)
    assert linea["cantidad"] == 2
