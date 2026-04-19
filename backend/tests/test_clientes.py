def test_listar_sin_autenticacion(client):
    r = client.get("/api/clientes/")
    assert r.status_code == 401


def test_vendedor_puede_ver_clientes(client, vendedor_token):
    r = client.get("/api/clientes/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_puede_crear_cliente(client, vendedor_token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Cliente Vendedor", "rut": "11.111.111-1"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 201


def test_crear_cliente(client, admin_token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Empresa ABC Ltda.", "rut": "76.543.210-K", "email": "contacto@abc.cl", "telefono": "+56221234567"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Empresa ABC Ltda."
    assert data["rut"] == "76.543.210-K"


def test_crear_cliente_rut_duplicado(client, admin_token):
    client.post("/api/clientes/", json={"nombre": "A", "rut": "99.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.post("/api/clientes/", json={"nombre": "B", "rut": "99.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 409


def test_listar_clientes(client, admin_token):
    client.post("/api/clientes/", json={"nombre": "Cliente X"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/clientes/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_actualizar_cliente(client, admin_token):
    r = client.post("/api/clientes/", json={"nombre": "Viejo"}, headers={"Authorization": f"Bearer {admin_token}"})
    cid = r.json()["id"]
    r2 = client.patch(
        f"/api/clientes/{cid}",
        json={"nombre": "Nuevo", "notas": "Cliente especial"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Nuevo"
    assert r2.json()["notas"] == "Cliente especial"


def test_eliminar_cliente(client, admin_token):
    r = client.post("/api/clientes/", json={"nombre": "Para Borrar"}, headers={"Authorization": f"Bearer {admin_token}"})
    cid = r.json()["id"]
    r2 = client.delete(f"/api/clientes/{cid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/clientes/{cid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_vendedor_no_puede_eliminar_cliente(client, vendedor_token):
    r = client.post(
        "/api/clientes/",
        json={"nombre": "No Borrar"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    cid = r.json()["id"]
    r2 = client.delete(f"/api/clientes/{cid}", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r2.status_code == 403


def test_exportar_excel_clientes(client, admin_token):
    r = client.get("/api/clientes/export/excel", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]


def test_actualizar_rut_duplicado(client, admin_token):
    client.post("/api/clientes/", json={"nombre": "A", "rut": "88.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.post("/api/clientes/", json={"nombre": "B", "rut": "88.000.002-2"}, headers={"Authorization": f"Bearer {admin_token}"})
    cid = r.json()["id"]
    r2 = client.patch(f"/api/clientes/{cid}", json={"rut": "88.000.001-1"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 409


def test_obtener_cliente(client, admin_token):
    r = client.post("/api/clientes/", json={"nombre": "Empresa Directa"}, headers={"Authorization": f"Bearer {admin_token}"})
    cid = r.json()["id"]
    r2 = client.get(f"/api/clientes/{cid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Empresa Directa"


def test_listar_clientes_con_filtro_q(client, admin_token):
    client.post("/api/clientes/", json={"nombre": "Ferretería Norte"}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/clientes/", json={"nombre": "Supermercado Sur"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/clientes/?q=Ferretería", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["nombre"] == "Ferretería Norte"


def test_crear_cliente_con_empresa(client, admin_token):
    emp = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa Z", "rut": "76.999.999-9"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    r = client.post(
        "/api/clientes/",
        json={"nombre": "Juan Pérez", "empresa_id": emp["id"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["empresa_id"] == emp["id"]
    assert data["empresa"]["nombre"] == "Empresa Z"
    assert data["empresa"]["rut"] == "76.999.999-9"


def test_filtrar_clientes_por_empresa(client, admin_token):
    emp = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa Filtro"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    client.post("/api/clientes/", json={"nombre": "Cliente 1", "empresa_id": emp["id"]}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/clientes/", json={"nombre": "Cliente Otro"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/clientes/?empresa_id={emp['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["nombre"] == "Cliente 1"


def test_cliente_sin_empresa_retorna_empresa_none(client, admin_token):
    r = client.post("/api/clientes/", json={"nombre": "Sin Empresa"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 201
    assert r.json()["empresa"] is None


def test_crear_cliente_con_nuevos_campos(client, admin_token):
    r = client.post(
        "/api/clientes/",
        json={
            "nombre": "María García",
            "recibe_correo": False,
            "forma_pago": "Crédito 30 días",
            "despacho_o_retiro": "despacho",
            "comuna": "Las Condes",
            "es_nuevo": True,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["recibe_correo"] is False
    assert data["forma_pago"] == "Crédito 30 días"
    assert data["despacho_o_retiro"] == "despacho"
    assert data["comuna"] == "Las Condes"
    assert data["es_nuevo"] is True
