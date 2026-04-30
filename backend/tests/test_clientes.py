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


def test_listar_clientes_insensible_tildes(client, admin_token):
    client.post("/api/clientes/", json={"nombre": "Áridos Martínez"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/clientes/?q=aridos", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(c["nombre"] == "Áridos Martínez" for c in r.json())


def test_listar_clientes_acento_en_query(client, admin_token):
    client.post("/api/clientes/", json={"nombre": "Aceros del Norte"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/clientes/?q=Acéros", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(c["nombre"] == "Aceros del Norte" for c in r.json())


def test_crear_cliente_con_empresa(client, admin_token):
    emp = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa Z", "rut": "76.999.999-K"},
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
    assert data["empresa"]["rut"] == "76.999.999-K"


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


def test_buscar_clientes_por_nombre_empresa(client, admin_token):
    emp = client.post(
        "/api/empresas/",
        json={"nombre": "Constructora Andina"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    client.post("/api/clientes/", json={"nombre": "Pedro Soto", "empresa_id": emp["id"]},
                headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/clientes/", json={"nombre": "Luis Torres"},
                headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/clientes/?q=Andina", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    nombres = [c["nombre"] for c in r.json()]
    assert "Pedro Soto" in nombres
    assert "Luis Torres" not in nombres


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


# ---------------------------------------------------------------------------
# Cliente facturas tab — GET /api/clientes/{id}/facturas
# ---------------------------------------------------------------------------


def _crear_factura_para_cliente(client, token, cliente_id, total_neto=500):
    r = client.post(
        "/api/facturas/",
        json={
            "cliente_id": cliente_id,
            "lineas": [{"orden": 0, "descripcion": "Item", "cantidad": 1, "valor_neto": total_neto}],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_facturas_cliente_404_si_no_existe(client, admin_token):
    r = client.get("/api/clientes/99999/facturas", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


def test_facturas_cliente_lista_con_pendiente(client, admin_token):
    c = client.post("/api/clientes/", json={"nombre": "ClienteFacTab"}, headers={"Authorization": f"Bearer {admin_token}"}).json()
    f = _crear_factura_para_cliente(client, admin_token, c["id"], total_neto=1000)

    r = client.get(f"/api/clientes/{c['id']}/facturas", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == f["id"]
    assert data[0]["numero"] == f["numero"]
    # pendiente = total - monto_pagado (0)
    assert float(data[0]["pendiente"]) == float(data[0]["total"])


def test_facturas_cliente_filtro_estado(client, admin_token):
    c = client.post("/api/clientes/", json={"nombre": "ClienteFacTabEstado"}, headers={"Authorization": f"Bearer {admin_token}"}).json()
    _crear_factura_para_cliente(client, admin_token, c["id"])

    # Filtro estado=anulada → 0
    r = client.get(
        f"/api/clientes/{c['id']}/facturas?estado=anulada",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json() == []


def test_facturas_cliente_vendedor_solo_ve_propias(
    client, admin_token, vendedor_token, vendedor_user, db
):
    """Vendedor solo ve facturas que le pertenecen — paridad con scope timeline."""
    from app.models.factura import Factura

    c = client.post("/api/clientes/", json={"nombre": "ClienteVendedorFac"}, headers={"Authorization": f"Bearer {admin_token}"}).json()
    f_propia = _crear_factura_para_cliente(client, admin_token, c["id"], total_neto=1000)
    f_ajena = _crear_factura_para_cliente(client, admin_token, c["id"], total_neto=2000)

    # Reasignar f_propia al vendedor
    fac = db.get(Factura, f_propia["id"])
    fac.vendedor_id = vendedor_user.id
    db.commit()

    r = client.get(
        f"/api/clientes/{c['id']}/facturas",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == f_propia["id"]
