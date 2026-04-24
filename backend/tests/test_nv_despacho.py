def _make_cliente(db):
    from app.models.cliente import Cliente
    c = Cliente(nombre="Test Cliente")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _make_empresa_y_sede(db):
    from app.models.empresa import Empresa
    from app.models.sede_despacho import SedeDespacho
    e = Empresa(nombre="Empresa Test", rut="76000000-0")
    db.add(e)
    db.commit()
    db.refresh(e)
    s = SedeDespacho(empresa_id=e.id, nombre="Bodega Central", direccion="Calle Falsa 123")
    db.add(s)
    db.commit()
    db.refresh(s)
    return e, s


def test_crear_nv_con_retiro_en_conico(client, admin_token, db):
    c = _make_cliente(db)
    resp = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": c.id, "retiro_en_conico": True, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["retiro_en_conico"] is True
    assert data["sede_despacho_id"] is None


def test_crear_nv_con_sede_despacho(client, admin_token, db):
    c = _make_cliente(db)
    _, sede = _make_empresa_y_sede(db)
    resp = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": c.id, "sede_despacho_id": sede.id, "lineas": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["sede_despacho_id"] == sede.id
    assert data["retiro_en_conico"] is False


def test_crear_nv_con_retiro_y_sede_falla(client, admin_token, db):
    c = _make_cliente(db)
    _, sede = _make_empresa_y_sede(db)
    resp = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": c.id,
            "retiro_en_conico": True,
            "sede_despacho_id": sede.id,
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422
