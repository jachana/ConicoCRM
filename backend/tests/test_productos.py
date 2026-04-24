import pytest


def test_listar_sin_autenticacion(client):
    r = client.get("/api/productos/")
    assert r.status_code == 401


def test_vendedor_puede_ver_productos(client, vendedor_token):
    r = client.get("/api/productos/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_no_puede_crear_producto(client, vendedor_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod X", "precio_venta": "20.00"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


def test_crear_producto(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Tornillo M6", "descripcion": "Tornillo inoxidable", "precio_venta": "120.00", "stock_minimo": 10},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Tornillo M6"
    assert float(data["precio_venta"]) == 120.0


def test_crear_producto_con_proveedor(client, admin_token):
    prov = client.post(
        "/api/proveedores/",
        json={"nombre": "Prov Z"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    prov_id = prov.json()["id"]
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod con Prov", "precio_venta": "20.00", "proveedor_id": prov_id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["proveedor_id"] == prov_id


def test_buscar_productos(client, admin_token):
    client.post("/api/productos/", json={"nombre": "Perno hexagonal", "precio_venta": "10.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/productos/", json={"nombre": "Tuerca M8", "precio_venta": "6.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/productos/buscar?q=perno", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    resultados = r.json()
    assert len(resultados) == 1
    assert resultados[0]["nombre"] == "Perno hexagonal"


def test_actualizar_producto(client, admin_token):
    r = client.post("/api/productos/", json={"nombre": "Viejo", "precio_venta": "2.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.patch(
        f"/api/productos/{pid}",
        json={"nombre": "Nuevo", "precio_venta": "999.00"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Nuevo"
    assert float(r2.json()["precio_venta"]) == 999.0


def test_eliminar_producto(client, admin_token):
    r = client.post("/api/productos/", json={"nombre": "Para Borrar", "precio_venta": "2.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.delete(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_exportar_excel_productos(client, admin_token):
    r = client.get("/api/productos/export/excel", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]


def test_producto_iva_computed(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Tornillo IVA", "precio_venta": "120.00"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert round(float(data["precio_con_iva"]), 2) == pytest.approx(142.80, abs=0.01)
    assert round(float(data["costo_con_iva"]), 2) == pytest.approx(0.00, abs=0.01)


def test_producto_con_marca(client, admin_token):
    marca_r = client.post(
        "/api/marcas/",
        json={"nombre": "MarcaTest"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert marca_r.status_code == 201
    marca_id = marca_r.json()["id"]

    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod con Marca", "precio_venta": "50.00", "marca_id": marca_id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["marca"] is not None
    assert data["marca"]["id"] == marca_id
    assert data["marca"]["nombre"] == "MarcaTest"


def test_producto_volumen(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod Volumen", "precio_venta": "30.00", "volumen": 5.5},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert float(data["volumen"]) == 5.5


def test_producto_precio_costo_actualizado_en_nullable_by_default(db):
    from app.models.producto import Producto
    p = Producto(nombre="Test", sku="X1")
    db.add(p); db.commit()
    db.refresh(p)
    assert p.precio_costo_actualizado_en is None


def test_producto_out_hides_cost_for_vendedor(client, vendedor_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="A", sku="X", precio_costo=Decimal("100"), precio_venta=Decimal("150"))
    db.add(p); db.commit()

    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert "precio_costo" not in body
    assert "costo_con_iva" not in body
    assert "precio_costo_actualizado_en" not in body
    assert "costo_desactualizado" not in body
    assert body["precio_venta"] == "150.00"


def test_producto_out_exposes_cost_for_admin(client, admin_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="A", sku="X", precio_costo=Decimal("100"))
    db.add(p); db.commit()

    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    body = resp.json()
    assert body["precio_costo"] == "100.00"
    assert "costo_con_iva" in body
    assert "costo_desactualizado" in body


def test_costo_desactualizado_true_when_null_fecha(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="X")
    db.add(p); db.commit()
    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()["costo_desactualizado"] is True


def test_costo_desactualizado_false_when_recent(client, admin_token, db):
    from app.models.producto import Producto
    from datetime import datetime, timezone
    p = Producto(nombre="A", sku="X", precio_costo_actualizado_en=datetime.now(timezone.utc))
    db.add(p); db.commit()
    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()["costo_desactualizado"] is False


def test_buscar_productos_hides_cost_for_vendedor(client, vendedor_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="Alfa", sku="A1", precio_costo=Decimal("100"), precio_venta=Decimal("150"))
    db.add(p); db.commit()

    resp = client.get("/api/productos/buscar?q=A", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    resultados = resp.json()
    assert len(resultados) >= 1
    for item in resultados:
        assert "precio_costo" not in item


def test_buscar_productos_exposes_cost_for_admin(client, admin_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="Alfa", sku="A1", precio_costo=Decimal("100"), precio_venta=Decimal("150"))
    db.add(p); db.commit()

    resp = client.get("/api/productos/buscar?q=A", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    resultados = resp.json()
    assert len(resultados) >= 1
    for item in resultados:
        assert "precio_costo" in item


def test_costo_desactualizado_uses_fallback_when_config_invalid(client, admin_token, db):
    from app.models.producto import Producto
    from app.models.system_config import SystemConfig
    from datetime import datetime, timezone
    existing = db.get(SystemConfig, "dias_alerta_costo_desactualizado")
    if existing:
        db.delete(existing)
        db.commit()
    db.add(SystemConfig(key="dias_alerta_costo_desactualizado", value="banana"))
    db.commit()

    p = Producto(nombre="A", sku="X", precio_costo_actualizado_en=datetime.now(timezone.utc))
    db.add(p); db.commit()

    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["costo_desactualizado"] is False
