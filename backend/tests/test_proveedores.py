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


# ── Sub-recursos: ordenes-compra y facturas-compra por proveedor ──────────────

def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _crear_proveedor(client, token, nombre):
    r = client.post("/api/proveedores/", json={"nombre": nombre}, headers=_auth(token))
    assert r.status_code == 201
    return r.json()["id"]


def _crear_oc(client, token, proveedor_id, fecha, fecha_entrega=None):
    payload = {
        "proveedor_id": proveedor_id,
        "fecha": fecha,
        "fecha_entrega_esperada": fecha_entrega,
        "lineas": [{"orden": 1, "descripcion": "Item OC", "cantidad": 2, "valor_neto": 1000}],
    }
    r = client.post("/api/ordenes-compra/", json=payload, headers=_auth(token))
    assert r.status_code == 201
    return r.json()


def _crear_fc(client, token, proveedor_id, fecha):
    payload = {
        "proveedor_id": proveedor_id,
        "fecha": fecha,
        "lineas": [{"descripcion": "Item FC", "cantidad": 1, "valor_neto": 5000}],
    }
    r = client.post("/api/facturas-compra/", json=payload, headers=_auth(token))
    assert r.status_code == 201
    return r.json()


def test_ordenes_compra_proveedor_filtrado_y_orden(client, admin_token):
    pid_a = _crear_proveedor(client, admin_token, "Prov OC A")
    pid_b = _crear_proveedor(client, admin_token, "Prov OC B")
    oc1 = _crear_oc(client, admin_token, pid_a, "2026-01-10", fecha_entrega="2026-01-20")
    oc2 = _crear_oc(client, admin_token, pid_a, "2026-03-05")
    _crear_oc(client, admin_token, pid_b, "2026-02-01")

    r = client.get(f"/api/proveedores/{pid_a}/ordenes-compra", headers=_auth(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert [d["id"] for d in data] == [oc2["id"], oc1["id"]]  # fecha desc
    assert data[0]["fecha"] == "2026-03-05"
    assert data[1]["fecha"] == "2026-01-10"
    assert data[1]["numero"] == oc1["numero"]
    assert data[1]["estado"] == "borrador"
    assert float(data[1]["total"]) == float(oc1["total"])
    assert data[1]["fecha_entrega_esperada"] == "2026-01-20"
    assert data[0]["fecha_entrega_esperada"] is None


def test_ordenes_compra_proveedor_filtro_estado(client, admin_token):
    pid = _crear_proveedor(client, admin_token, "Prov OC Estado")
    oc1 = _crear_oc(client, admin_token, pid, "2026-01-01")
    _crear_oc(client, admin_token, pid, "2026-01-02")
    r_cancel = client.patch(
        f"/api/ordenes-compra/{oc1['id']}/estado",
        json={"estado": "cancelada"},
        headers=_auth(admin_token),
    )
    assert r_cancel.status_code == 200

    r = client.get(
        f"/api/proveedores/{pid}/ordenes-compra",
        params={"estado": ["cancelada"]},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["id"] == oc1["id"]
    assert data[0]["estado"] == "cancelada"


def test_ordenes_compra_proveedor_404(client, admin_token):
    r = client.get("/api/proveedores/999999/ordenes-compra", headers=_auth(admin_token))
    assert r.status_code == 404
    assert r.json()["detail"] == "Proveedor no encontrado"


def test_ordenes_compra_proveedor_403_vendedor(client, vendedor_token):
    r = client.get("/api/proveedores/1/ordenes-compra", headers=_auth(vendedor_token))
    assert r.status_code == 403


def test_facturas_compra_proveedor_filtrado_y_orden(client, admin_token):
    pid_a = _crear_proveedor(client, admin_token, "Prov FC A")
    pid_b = _crear_proveedor(client, admin_token, "Prov FC B")
    fc1 = _crear_fc(client, admin_token, pid_a, "2026-02-10")
    fc2 = _crear_fc(client, admin_token, pid_a, "2026-04-01")
    _crear_fc(client, admin_token, pid_b, "2026-03-15")

    r = client.get(f"/api/proveedores/{pid_a}/facturas-compra", headers=_auth(admin_token))
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert [d["id"] for d in data] == [fc2["id"], fc1["id"]]  # fecha desc
    assert data[0]["fecha"] == "2026-04-01"
    assert data[1]["fecha"] == "2026-02-10"
    assert data[1]["numero"] == fc1["numero"]
    assert data[1]["estado"] == "emitida"
    assert float(data[1]["total"]) == float(fc1["total"])


def test_facturas_compra_proveedor_filtro_estado(client, admin_token):
    pid = _crear_proveedor(client, admin_token, "Prov FC Estado")
    _crear_fc(client, admin_token, pid, "2026-01-05")

    r = client.get(
        f"/api/proveedores/{pid}/facturas-compra",
        params={"estado": ["pagada"]},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    assert r.json() == []

    r2 = client.get(
        f"/api/proveedores/{pid}/facturas-compra",
        params={"estado": ["emitida"]},
        headers=_auth(admin_token),
    )
    assert r2.status_code == 200
    assert len(r2.json()) == 1


def test_facturas_compra_proveedor_404(client, admin_token):
    r = client.get("/api/proveedores/999999/facturas-compra", headers=_auth(admin_token))
    assert r.status_code == 404
    assert r.json()["detail"] == "Proveedor no encontrado"


def test_facturas_compra_proveedor_403_vendedor(client, vendedor_token):
    r = client.get("/api/proveedores/1/facturas-compra", headers=_auth(vendedor_token))
    assert r.status_code == 403
