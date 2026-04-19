def test_listar_empresas_sin_auth(client):
    r = client.get("/api/empresas/")
    assert r.status_code == 401


def test_crear_empresa(client, admin_token):
    r = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa A", "rut": "76.123.456-7", "razon_social": "Empresa A Ltda."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Empresa A"
    assert data["rut"] == "76.123.456-7"
    assert data["razon_social"] == "Empresa A Ltda."
    assert "id" in data


def test_crear_empresa_rut_duplicado(client, admin_token):
    client.post("/api/empresas/", json={"nombre": "Emp A", "rut": "76.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.post("/api/empresas/", json={"nombre": "Emp B", "rut": "76.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


def test_listar_empresas(client, admin_token):
    client.post("/api/empresas/", json={"nombre": "Emp X"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empresas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_buscar_empresa_por_nombre(client, admin_token):
    client.post("/api/empresas/", json={"nombre": "Constructora XYZ"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empresas/?q=constructora", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(e["nombre"] == "Constructora XYZ" for e in r.json())


def test_buscar_empresa_por_rut(client, admin_token):
    client.post("/api/empresas/", json={"nombre": "Emp Z", "rut": "77.777.777-7"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empresas/?q=77.777.777", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(e["rut"] == "77.777.777-7" for e in r.json())


def test_obtener_empresa(client, admin_token):
    r = client.post("/api/empresas/", json={"nombre": "Emp Y"}, headers={"Authorization": f"Bearer {admin_token}"})
    eid = r.json()["id"]
    r2 = client.get(f"/api/empresas/{eid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Emp Y"


def test_obtener_empresa_inexistente(client, admin_token):
    r = client.get("/api/empresas/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


def test_actualizar_empresa(client, admin_token):
    r = client.post("/api/empresas/", json={"nombre": "Antigua"}, headers={"Authorization": f"Bearer {admin_token}"})
    eid = r.json()["id"]
    r2 = client.patch(f"/api/empresas/{eid}", json={"nombre": "Nueva", "sector": "Construcción"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Nueva"
    assert r2.json()["sector"] == "Construcción"


def test_eliminar_empresa(client, admin_token):
    r = client.post("/api/empresas/", json={"nombre": "Para Borrar"}, headers={"Authorization": f"Bearer {admin_token}"})
    eid = r.json()["id"]
    r2 = client.delete(f"/api/empresas/{eid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/empresas/{eid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_eliminar_empresa_con_clientes_falla(client, admin_token):
    emp = client.post("/api/empresas/", json={"nombre": "Emp Con Clientes"}, headers={"Authorization": f"Bearer {admin_token}"}).json()
    client.post("/api/clientes/", json={"nombre": "Cliente X", "empresa_id": emp["id"]}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.delete(f"/api/empresas/{emp['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409
    assert "clientes asociados" in r.json()["detail"]


def test_vendedor_puede_ver_empresas(client, vendedor_token):
    r = client.get("/api/empresas/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_no_puede_crear_empresa(client, vendedor_token):
    r = client.post("/api/empresas/", json={"nombre": "Intento"}, headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403
