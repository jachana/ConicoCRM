"""Tests for the cost-approval endpoint and related state machine fixes."""
import random
from decimal import Decimal

import pytest

from app.models.producto import Producto


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_producto_sin_costo(client, token):
    """Create a product with precio_costo=0 (no lots, so cost is 0)."""
    r = client.post("/api/productos/", json={
        "nombre": "Prod Sin Costo",
        "sku": f"SKU-SC-{random.randint(10000, 99999)}",
        "precio_venta": 1000,
        "precio_costo": 0,
        "unidad": "un",
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _make_cliente(client, token):
    r = client.post("/api/clientes/", json={"nombre": "Cliente AC Test"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _create_nv_sin_costo(client, token):
    """Creates a NV with a costo=0 product, which should land in pendiente_aprobacion_costo."""
    prod = _make_producto_sin_costo(client, token)
    cid = _make_cliente(client, token)
    r = client.post("/api/nota_ventas/", json={
        "cliente_id": cid,
        "retiro_en_conico": True,
        "lineas": [{"orden": 1, "descripcion": "Prod sin costo", "producto_id": prod["id"],
                    "cantidad": 2, "valor_neto": 500}],
    }, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    nv = r.json()
    assert nv["estado"] == "pendiente_aprobacion_costo", (
        f"Expected pendiente_aprobacion_costo but got {nv['estado']}"
    )
    return nv


# ── tests ─────────────────────────────────────────────────────────────────────

def test_aprobar_nv_costo_cero(client, admin_token, db):
    """Admin can approve a cost-zero NV; estado becomes pendiente and NO stock movements are created (NVs no longer move stock)."""
    from app.models.movimiento_inventario import MovimientoInventario

    nv = _create_nv_sin_costo(client, admin_token)
    nv_id = nv["id"]
    linea = nv["lineas"][0]
    producto_id = linea["producto_id"]

    r = client.post(f"/api/aprobaciones-costo/{nv_id}/aprobar",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["estado"] == "pendiente"

    # NVs no longer create stock movements — only facturas/boletas do at emission time.
    movs = db.query(MovimientoInventario).filter(
        MovimientoInventario.referencia_tipo == "nota_venta",
        MovimientoInventario.referencia_id == nv_id,
    ).all()
    assert len(movs) == 0, "NV approval must not create stock movements anymore"

    # precio_costo must NOT be mutated by approval
    producto = db.get(Producto, producto_id)
    assert producto.precio_costo == Decimal("0")


def test_vendedor_no_puede_aprobar_costo(client, admin_token, vendedor_token):
    """A vendedor gets 403 when trying to approve a cost-pending NV."""
    nv = _create_nv_sin_costo(client, admin_token)
    nv_id = nv["id"]

    r = client.post(f"/api/aprobaciones-costo/{nv_id}/aprobar",
                    headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403, r.text


def test_cancelar_nv_costo_pendiente(client, admin_token, db):
    """Cancelling a pendiente_aprobacion_costo NV does not create devolución movements."""
    from app.models.movimiento_inventario import MovimientoInventario

    nv = _create_nv_sin_costo(client, admin_token)
    nv_id = nv["id"]

    r = client.patch(f"/api/nota_ventas/{nv_id}/estado",
                     json={"estado": "cancelada"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "cancelada"

    # No entrada movements should exist for this NV (devolution writes tipo="entrada")
    devol_movs = db.query(MovimientoInventario).filter(
        MovimientoInventario.referencia_tipo == "nota_venta",
        MovimientoInventario.referencia_id == nv_id,
        MovimientoInventario.tipo == "entrada",
    ).all()
    assert len(devol_movs) == 0, "Expected no devolución movements for cost-pending NV cancellation"


def test_eliminar_nv_costo_pendiente(client, admin_token, db):
    """Deleting a pendiente_aprobacion_costo NV returns 204 and creates no devolución movements."""
    from app.models.movimiento_inventario import MovimientoInventario

    nv = _create_nv_sin_costo(client, admin_token)
    nv_id = nv["id"]

    r = client.delete(f"/api/nota_ventas/{nv_id}",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 204, r.text

    # NV should be gone
    r2 = client.get(f"/api/nota_ventas/{nv_id}",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 404

    # No devolución movements
    devol_movs = db.query(MovimientoInventario).filter(
        MovimientoInventario.referencia_tipo == "nota_venta",
        MovimientoInventario.referencia_id == nv_id,
    ).all()
    assert len(devol_movs) == 0, "Expected no movements for deleted cost-pending NV"
