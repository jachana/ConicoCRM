def _make_cliente(db):
    from app.models.cliente import Cliente
    c = Cliente(nombre="Test Cliente")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_crear_nv_sin_direccion_ni_retiro_falla(client, admin_token, db):
    c = _make_cliente(db)
    resp = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": c.id, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422
    detail = str(resp.json()["detail"]).lower()
    assert "despacho" in detail or "retiro" in detail


def test_crear_nv_con_retiro_en_conico(client, admin_token, db):
    c = _make_cliente(db)
    resp = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": c.id, "retiro_en_conico": True, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["retiro_en_conico"] is True
    assert data["direccion_despacho"] is None


def test_crear_nv_con_direccion(client, admin_token, db):
    c = _make_cliente(db)
    resp = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": c.id, "direccion_despacho": "Calle Falsa 123", "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["direccion_despacho"] == "Calle Falsa 123"
