def test_crear_producto_con_tags(client, admin_token):
    resp = client.post(
        "/api/productos/",
        json={"nombre": "Tubo acero", "tags": ["acero", "304"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert set(data["tags"]) == {"acero", "304"}


def test_buscar_producto_por_sku(client, admin_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="Válvula", sku="VLV-001", precio_costo=Decimal("100"), precio_venta=Decimal("150"), stock_minimo=0, stock_actual=10)
    db.add(p)
    db.commit()

    resp = client.get("/api/productos/buscar?q=VLV-001", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert any(item["sku"] == "VLV-001" for item in resp.json())


def test_buscar_producto_por_tag(client, admin_token):
    client.post(
        "/api/productos/",
        json={"nombre": "Bomba hidráulica", "tags": ["hidraulica", "industrial"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = client.get("/api/productos/buscar?q=hidraulica", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert any("Bomba" in p["nombre"] for p in resp.json())


def test_listar_tags(client, admin_token):
    client.post("/api/tags/", json={"nombre": "premium"}, headers={"Authorization": f"Bearer {admin_token}"})
    resp = client.get("/api/tags/", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert any(t["nombre"] == "premium" for t in resp.json())
