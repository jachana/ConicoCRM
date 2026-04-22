def test_crear_banco_receptor(client, admin_token):
    resp = client.post(
        "/api/bancos-receptores/",
        json={"nombre": "Banco Estado"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["nombre"] == "Banco Estado"
    assert data["activo"] is True


def test_listar_bancos(client, admin_token):
    client.post("/api/bancos-receptores/", json={"nombre": "Santander"}, headers={"Authorization": f"Bearer {admin_token}"})
    resp = client.get("/api/bancos-receptores/", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert any(b["nombre"] == "Santander" for b in resp.json())


def test_toggle_banco(client, admin_token):
    r = client.post("/api/bancos-receptores/", json={"nombre": "BCI"}, headers={"Authorization": f"Bearer {admin_token}"})
    bid = r.json()["id"]
    resp = client.patch(f"/api/bancos-receptores/{bid}", json={"activo": False}, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["activo"] is False


def test_factura_acepta_banco_receptor_id(client, admin_token, db):
    from app.models.banco_receptor import BancoReceptor
    from app.models.cliente import Cliente
    banco = BancoReceptor(nombre="BICE")
    c = Cliente(nombre="Cliente BRTest")
    db.add_all([banco, c])
    db.commit()
    db.refresh(banco)
    db.refresh(c)

    resp = client.post(
        "/api/facturas/",
        json={"cliente_id": c.id, "banco_receptor_id": banco.id, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["banco_receptor_id"] == banco.id
