# backend/tests/test_empleados.py

def test_listar_sin_auth(client):
    r = client.get("/api/empleados/")
    assert r.status_code == 401


def test_subadmin_no_puede_ver(client, subadmin_token):
    r = client.get("/api/empleados/", headers={"Authorization": f"Bearer {subadmin_token}"})
    assert r.status_code == 403


def test_crear_empleado(client, admin_token):
    r = client.post(
        "/api/empleados/",
        json={"nombre": "Juan Pérez", "cargo": "Vendedor", "sueldo_base": 850000},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Juan Pérez"
    assert data["cargo"] == "Vendedor"
    assert data["sueldo_base"] == 850000.0
    assert data["is_active"] is True
    assert "id" in data


def test_crear_empleado_minimo(client, admin_token):
    r = client.post(
        "/api/empleados/",
        json={"nombre": "Ana García", "cargo": "Contadora"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["sueldo_base"] is None
    assert r.json()["fecha_ingreso"] is None


def test_listar_empleados(client, admin_token):
    client.post("/api/empleados/", json={"nombre": "Emp A", "cargo": "X"}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/empleados/", json={"nombre": "Emp B", "cargo": "Y"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empleados/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_buscar_empleado_por_nombre(client, admin_token):
    client.post("/api/empleados/", json={"nombre": "Carlos Ruiz", "cargo": "Jefe"}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/empleados/", json={"nombre": "María López", "cargo": "Aux"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empleados/?q=carlos", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["nombre"] == "Carlos Ruiz"


def test_obtener_empleado(client, admin_token):
    eid = client.post("/api/empleados/", json={"nombre": "Pedro", "cargo": "Dev"}, headers={"Authorization": f"Bearer {admin_token}"}).json()["id"]
    r = client.get(f"/api/empleados/{eid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["nombre"] == "Pedro"


def test_obtener_empleado_inexistente(client, admin_token):
    r = client.get("/api/empleados/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


def test_actualizar_empleado(client, admin_token):
    eid = client.post("/api/empleados/", json={"nombre": "Viejo", "cargo": "Dev"}, headers={"Authorization": f"Bearer {admin_token}"}).json()["id"]
    r = client.patch(f"/api/empleados/{eid}", json={"nombre": "Nuevo", "cargo": "Lead"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["nombre"] == "Nuevo"
    assert r.json()["cargo"] == "Lead"


def test_desactivar_empleado(client, admin_token):
    eid = client.post("/api/empleados/", json={"nombre": "Temp", "cargo": "X"}, headers={"Authorization": f"Bearer {admin_token}"}).json()["id"]
    r = client.patch(f"/api/empleados/{eid}", json={"is_active": False}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["is_active"] is False


def test_eliminar_empleado(client, admin_token):
    eid = client.post("/api/empleados/", json={"nombre": "Borrar", "cargo": "X"}, headers={"Authorization": f"Bearer {admin_token}"}).json()["id"]
    r = client.delete(f"/api/empleados/{eid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 204
    r2 = client.get(f"/api/empleados/{eid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 404


def test_eliminar_empleado_inexistente(client, admin_token):
    r = client.delete("/api/empleados/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


def test_buscar_empleado_insensible_tildes(client, admin_token):
    client.post("/api/empleados/", json={"nombre": "José Pérez", "cargo": "Técnico"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empleados/?q=jose", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(e["nombre"] == "José Pérez" for e in r.json())


def test_buscar_empleado_cargo_insensible_tildes(client, admin_token):
    client.post("/api/empleados/", json={"nombre": "Ana Ruiz", "cargo": "Administración"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/empleados/?q=administracion", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(e["nombre"] == "Ana Ruiz" for e in r.json())
