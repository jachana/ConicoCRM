def test_listar_sin_autenticacion(client):
    r = client.get("/api/productos/")
    assert r.status_code == 401


def test_vendedor_puede_ver_productos(client, vendedor_token):
    r = client.get("/api/productos/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_no_puede_crear_producto(client, vendedor_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod X", "precio_costo": "10.00", "precio_venta": "20.00"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


def test_crear_producto(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Tornillo M6", "descripcion": "Tornillo inoxidable", "precio_costo": "50.00", "precio_venta": "120.00", "stock_minimo": 10},
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
        json={"nombre": "Prod con Prov", "precio_costo": "10.00", "precio_venta": "20.00", "proveedor_id": prov_id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["proveedor_id"] == prov_id


def test_buscar_productos(client, admin_token):
    client.post("/api/productos/", json={"nombre": "Perno hexagonal", "precio_costo": "5.00", "precio_venta": "10.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/productos/", json={"nombre": "Tuerca M8", "precio_costo": "3.00", "precio_venta": "6.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/productos/buscar?q=perno", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    resultados = r.json()
    assert len(resultados) == 1
    assert resultados[0]["nombre"] == "Perno hexagonal"


def test_actualizar_producto(client, admin_token):
    r = client.post("/api/productos/", json={"nombre": "Viejo", "precio_costo": "1.00", "precio_venta": "2.00"}, headers={"Authorization": f"Bearer {admin_token}"})
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
    r = client.post("/api/productos/", json={"nombre": "Para Borrar", "precio_costo": "1.00", "precio_venta": "2.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.delete(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_exportar_excel_productos(client, admin_token):
    r = client.get("/api/productos/export/excel", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
