def test_listar_marcas(client, admin_token):
    resp = client.get("/api/marcas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    # Seed data from migration should not be here (test DB is fresh each run)
    # This just verifies the endpoint works and returns a list


def test_crear_marca(client, admin_token):
    resp = client.post(
        "/api/marcas/",
        json={"nombre": "Castrol"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["nombre"] == "Castrol"
    assert resp.json()["activa"] is True


def test_crear_marca_duplicada_falla(client, admin_token):
    client.post("/api/marcas/", json={"nombre": "Castrol"}, headers={"Authorization": f"Bearer {admin_token}"})
    resp = client.post("/api/marcas/", json={"nombre": "Castrol"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 409


def test_actualizar_marca(client, admin_token):
    created = client.post("/api/marcas/", json={"nombre": "Valvoline"}, headers={"Authorization": f"Bearer {admin_token}"}).json()
    resp = client.patch(
        f"/api/marcas/{created['id']}",
        json={"activa": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["activa"] is False


def test_vendedor_no_puede_crear_marca(client, vendedor_token):
    resp = client.post("/api/marcas/", json={"nombre": "X"}, headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 403
