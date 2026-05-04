def test_listar_sin_autenticacion(client):
    r = client.get("/api/proveedores/")
    assert r.status_code == 401


def test_listar_sin_permisos_vendedor(client, vendedor_token):
    r = client.get("/api/proveedores/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403


def test_crear_proveedor(client, admin_token):
    r = client.post(
        "/api/proveedores/",
        json={"nombre": "Proveedor A", "rut": "76.123.456-0", "contacto": "Juan"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Proveedor A"
    assert data["rut"] == "76.123.456-0"
    assert "id" in data


def test_crear_proveedor_rut_duplicado(client, admin_token):
    client.post(
        "/api/proveedores/",
        json={"nombre": "Prov A", "rut": "76.000.001-9"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r = client.post(
        "/api/proveedores/",
        json={"nombre": "Prov B", "rut": "76.000.001-9"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 409


def test_listar_proveedores(client, admin_token):
    client.post("/api/proveedores/", json={"nombre": "Prov X"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/proveedores/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_obtener_proveedor(client, admin_token):
    r = client.post("/api/proveedores/", json={"nombre": "Prov Y"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.get(f"/api/proveedores/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Prov Y"


def test_actualizar_proveedor(client, admin_token):
    r = client.post("/api/proveedores/", json={"nombre": "Antiguo"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.patch(
        f"/api/proveedores/{pid}",
        json={"nombre": "Nuevo", "telefono": "+56912345678"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Nuevo"
    assert r2.json()["telefono"] == "+56912345678"


def test_eliminar_proveedor(client, admin_token):
    r = client.post("/api/proveedores/", json={"nombre": "Para Borrar"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.delete(f"/api/proveedores/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/proveedores/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_subadmin_puede_ver_proveedores(client, subadmin_token):
    r = client.get("/api/proveedores/", headers={"Authorization": f"Bearer {subadmin_token}"})
    assert r.status_code == 200


def test_actualizar_rut_duplicado(client, admin_token):
    client.post("/api/proveedores/", json={"nombre": "A", "rut": "11.111.111-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    r2 = client.post("/api/proveedores/", json={"nombre": "B", "rut": "22.222.222-2"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r2.json()["id"]
    r3 = client.patch(f"/api/proveedores/{pid}", json={"rut": "11.111.111-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 409


def test_exportar_excel(client, admin_token):
    r = client.get("/api/proveedores/export/excel", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]


def test_crear_proveedor_rut_invalido_rechazado(client, admin_token):
    r = client.post(
        "/api/proveedores/",
        json={"nombre": "Prov Inv", "rut": "76.123.456-7"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_actualizar_proveedor_rut_invalido_rechazado(client, admin_token):
    r = client.post("/api/proveedores/", json={"nombre": "Prov OK"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.patch(
        f"/api/proveedores/{pid}",
        json={"rut": "12.345.678-9"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 422
