import pytest


@pytest.fixture
def empresa_id(client, admin_token):
    resp = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa Test Sede"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_create_sede(client, admin_token, empresa_id):
    resp = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede Principal", "direccion": "Av. Principal 123"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["nombre"] == "Sede Principal"
    assert data["direccion"] == "Av. Principal 123"
    assert data["empresa_id"] == empresa_id
    assert "id" in data


def test_list_sedes_by_empresa(client, admin_token, empresa_id):
    for i in range(2):
        client.post(
            "/api/sedes-despacho/",
            json={"empresa_id": empresa_id, "nombre": f"Sede {i}", "direccion": f"Calle {i}"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    resp = client.get(
        f"/api/sedes-despacho/?empresa_id={empresa_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_update_sede(client, admin_token, empresa_id):
    create = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Vieja", "direccion": "Av 1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    sede_id = create.json()["id"]
    resp = client.put(
        f"/api/sedes-despacho/{sede_id}",
        json={"nombre": "Nueva", "direccion": "Av 2"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["nombre"] == "Nueva"
    assert resp.json()["direccion"] == "Av 2"


def test_delete_sede(client, admin_token, empresa_id):
    create = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Para Borrar", "direccion": "X"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    sede_id = create.json()["id"]
    resp = client.delete(
        f"/api/sedes-despacho/{sede_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204
    list_resp = client.get(
        f"/api/sedes-despacho/?empresa_id={empresa_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert all(s["id"] != sede_id for s in list_resp.json())


def test_delete_sede_404(client, admin_token):
    resp = client.delete(
        "/api/sedes-despacho/99999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_cascade_delete_empresa_removes_sedes(client, admin_token, empresa_id):
    client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede", "direccion": "Dirección"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    client.delete(
        f"/api/empresas/{empresa_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = client.get(
        f"/api/sedes-despacho/?empresa_id={empresa_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.fixture
def cliente_id(client, admin_token):
    resp = client.post(
        "/api/clientes/",
        json={"nombre": "Cliente NV Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_nv_with_sede_despacho(client, admin_token, empresa_id, cliente_id):
    sede = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede A", "direccion": "Calle 1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente_id,
            "empresa_id": empresa_id,
            "sede_despacho_id": sede["id"],
            "retiro_en_conico": False,
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sede_despacho_id"] == sede["id"]
    assert data["sede_despacho"]["nombre"] == "Sede A"


def test_nv_retiro_en_conico_no_sede(client, admin_token, cliente_id):
    resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente_id,
            "retiro_en_conico": True,
            "sede_despacho_id": None,
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["retiro_en_conico"] is True
    assert resp.json()["sede_despacho_id"] is None


def test_nv_mutual_exclusivity_error(client, admin_token, empresa_id, cliente_id):
    sede = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede B", "direccion": "Calle 2"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente_id,
            "retiro_en_conico": True,
            "sede_despacho_id": sede["id"],
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_nv_both_empty_is_valid(client, admin_token, cliente_id):
    resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente_id,
            "retiro_en_conico": False,
            "sede_despacho_id": None,
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201


def test_delete_sede_blocked_by_nv(client, admin_token, empresa_id, cliente_id):
    sede = client.post(
        "/api/sedes-despacho/",
        json={"empresa_id": empresa_id, "nombre": "Sede Referenciada", "direccion": "Av X"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    client.post(
        "/api/nota_ventas/",
        json={"cliente_id": cliente_id, "sede_despacho_id": sede["id"], "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = client.delete(
        f"/api/sedes-despacho/{sede['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 409
