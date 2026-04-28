from datetime import date
from decimal import Decimal
import random


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_cliente(db):
    from app.models.cliente import Cliente
    c = Cliente(nombre="Test Cliente")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _make_empresa(db, linea_credito=None):
    from app.models.empresa import Empresa
    e = Empresa(nombre="Test Empresa", linea_credito=linea_credito)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _make_producto(db):
    from app.models.producto import Producto
    p = Producto(nombre="Prod Test", precio_costo=Decimal("500"))
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_factura(db, empresa_id, cliente_id, total, monto_pagado=None):
    from app.models.factura import Factura
    f = Factura(
        numero=random.randint(10000, 99999),
        cliente_id=cliente_id,
        empresa_id=empresa_id,
        total=Decimal(str(total)),
        monto_pagado=Decimal(str(monto_pagado)) if monto_pagado is not None else None,
        estado="emitida",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _nv_payload(cliente_id, empresa_id, producto_id, valor_neto):
    return {
        "cliente_id": cliente_id,
        "empresa_id": empresa_id,
        "fecha": str(date.today()),
        "retiro_en_conico": True,
        "lineas": [{
            "orden": 1,
            "producto_id": producto_id,
            "descripcion": "Test item",
            "cantidad": 1,
            "valor_neto": valor_neto,
        }],
    }


# ── tests ─────────────────────────────────────────────────────────────────────

def test_vendedor_blocked_over_credit_limit(client, vendedor_token, vendedor_user, db):
    """Vendedor cannot create NV when total exceeds credito_disponible."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, linea_credito=Decimal("100000"))
    producto = _make_producto(db)
    # 90000 of credit already used via unpaid factura
    _make_factura(db, empresa.id, cliente.id, total=90000)
    # NV valor_neto=10000 → total_con_iva=11900, which exceeds disponible (10000)
    resp = client.post(
        "/api/nota_ventas/",
        json=_nv_payload(cliente.id, empresa.id, producto.id, 10000),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 402
    assert "crédito" in resp.json()["detail"].lower()


def test_vendedor_allowed_within_credit_limit(client, vendedor_token, vendedor_user, db):
    """Vendedor can create NV when total is within credito_disponible."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, linea_credito=Decimal("100000"))
    producto = _make_producto(db)
    _make_factura(db, empresa.id, cliente.id, total=50000)
    # NV valor_neto=1000 → total=1190, within disponible (50000)
    resp = client.post(
        "/api/nota_ventas/",
        json=_nv_payload(cliente.id, empresa.id, producto.id, 1000),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201


def test_admin_bypasses_credit_limit(client, admin_token, admin_user, db):
    """Admin can create NV even when over credit limit."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, linea_credito=Decimal("1000"))
    producto = _make_producto(db)
    _make_factura(db, empresa.id, cliente.id, total=1000)
    # Credit is fully used, but admin can still create
    resp = client.post(
        "/api/nota_ventas/",
        json=_nv_payload(cliente.id, empresa.id, producto.id, 50000),
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201


def test_no_limit_set_vendedor_can_create(client, vendedor_token, vendedor_user, db):
    """Vendedor can create NV freely when empresa has no linea_credito."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, linea_credito=None)
    producto = _make_producto(db)
    resp = client.post(
        "/api/nota_ventas/",
        json=_nv_payload(cliente.id, empresa.id, producto.id, 999999),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201


# ── from_cotizacion tests ─────────────────────────────────────────────────────

def _make_cotizacion_with_product(db, cliente_id, vendedor_id, empresa_id, producto_id, linea_total):
    """Create a cotizacion with one linea that has a producto_id."""
    from app.models.cotizacion import Cotizacion, CotizacionLinea
    cot = Cotizacion(
        numero=random.randint(10000, 99999),
        cliente_id=cliente_id,
        vendedor_id=vendedor_id,
        empresa_id=empresa_id,
        fecha=date.today(),
        total=Decimal(str(linea_total)),
    )
    db.add(cot)
    db.flush()
    total = Decimal(str(linea_total))
    total_neto = (total / Decimal("1.19")).quantize(Decimal("0.01"))
    iva = total - total_neto
    linea = CotizacionLinea(
        cotizacion_id=cot.id,
        orden=1,
        producto_id=producto_id,
        descripcion="Test item",
        cantidad=1,
        valor_neto=total_neto,
        total_neto=total_neto,
        iva=iva,
        total=total,
    )
    db.add(linea)
    db.commit()
    db.refresh(cot)
    return cot


def test_vendedor_blocked_from_cotizacion_over_limit(client, vendedor_token, vendedor_user, db):
    """Vendedor cannot convert cotizacion to NV when it exceeds credito_disponible."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, linea_credito=Decimal("100000"))
    producto = _make_producto(db)
    _make_factura(db, empresa.id, cliente.id, total=90000)
    # Cotizacion total (with IVA) = 11900, disponible = 10000 → blocked
    cot = _make_cotizacion_with_product(
        db, cliente.id, vendedor_user.id, empresa.id, producto.id, linea_total=11900
    )
    resp = client.post(
        f"/api/nota_ventas/from_cotizacion/{cot.id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 402
    assert "crédito" in resp.json()["detail"].lower()


def test_admin_bypasses_credit_from_cotizacion(client, admin_token, admin_user, db):
    """Admin can convert cotizacion to NV even when over credit limit."""
    cliente = _make_cliente(db)
    empresa = _make_empresa(db, linea_credito=Decimal("1000"))
    producto = _make_producto(db)
    _make_factura(db, empresa.id, cliente.id, total=1000)
    cot = _make_cotizacion_with_product(
        db, cliente.id, admin_user.id, empresa.id, producto.id, linea_total=50000
    )
    resp = client.post(
        f"/api/nota_ventas/from_cotizacion/{cot.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
