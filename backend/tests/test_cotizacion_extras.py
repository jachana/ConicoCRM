import pytest
from decimal import Decimal


def _make_cliente_vendedor(db):
    from app.models.cliente import Cliente
    from app.models.user import User
    from app.core.security import get_password_hash
    c = Cliente(nombre="Test")
    u = User(email="v@cottest.cl", name="V", hashed_password=get_password_hash("x"), role="admin")
    db.add_all([c, u])
    db.commit()
    db.refresh(c)
    db.refresh(u)
    return c, u


def _make_producto(db):
    from app.models.producto import Producto
    p = Producto(nombre="Prod", sku="P-001", precio_costo=50, precio_venta=100)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_cotizacion_validez_dias_default(client, admin_token, db):
    c, u = _make_cliente_vendedor(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["validez_dias"] == 5


def test_cotizacion_validez_dias_custom(client, admin_token, db):
    c, u = _make_cliente_vendedor(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "vendedor_id": u.id, "validez_dias": 15, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["validez_dias"] == 15


def test_cotizacion_linea_con_descuento(client, admin_token, db):
    c, u = _make_cliente_vendedor(db)
    p = _make_producto(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": c.id,
            "vendedor_id": u.id,
            "lineas": [{"orden": 1, "producto_id": p.id, "descripcion": "Item", "cantidad": 2, "valor_neto": 100, "descuento": 10}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    linea = resp.json()["lineas"][0]
    assert float(linea["descuento"]) == pytest.approx(10.0)
    # total_neto = 2 * 100 * (1 - 10/100) = 180
    assert float(linea["total_neto"]) == pytest.approx(180.0)


def test_fecha_expiracion_en_response(client, admin_token, db):
    from datetime import date, timedelta
    c, u = _make_cliente_vendedor(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "validez_dias": 7, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    expected = (date.today() + timedelta(days=7)).isoformat()
    assert data["fecha_expiracion"] == expected


def test_fecha_expiracion_default_5_dias(client, admin_token, db):
    from datetime import date, timedelta
    c, u = _make_cliente_vendedor(db)
    resp = client.post(
        "/api/cotizaciones/",
        json={"cliente_id": c.id, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    expected = (date.today() + timedelta(days=5)).isoformat()
    assert data["fecha_expiracion"] == expected
