def test_listar_tipos(client, admin_token):
    resp = client.get(
        "/api/tipos-producto/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_crear_tipo_admin(client, admin_token):
    resp = client.post(
        "/api/tipos-producto/",
        json={"nombre": "Hidraulico"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["nombre"] == "hidraulico"


def test_crear_tipo_idempotente(client, admin_token):
    a = client.post(
        "/api/tipos-producto/",
        json={"nombre": "motor"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    b = client.post(
        "/api/tipos-producto/",
        json={"nombre": "motor"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    assert a["id"] == b["id"]


def test_vendedor_no_crea_tipo(client, vendedor_token):
    resp = client.post(
        "/api/tipos-producto/",
        json={"nombre": "x"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendedor_no_borra_tipo(client, admin_token, vendedor_token):
    tipo = client.post(
        "/api/tipos-producto/",
        json={"nombre": "transmision"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    resp = client.delete(
        f"/api/tipos-producto/{tipo['id']}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_eliminar_tipo_admin(client, admin_token):
    tipo = client.post(
        "/api/tipos-producto/",
        json={"nombre": "borrame"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    resp = client.delete(
        f"/api/tipos-producto/{tipo['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204


def test_crear_producto_con_tipos(client, admin_token):
    t1 = client.post(
        "/api/tipos-producto/",
        json={"nombre": "hidraulico"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    t2 = client.post(
        "/api/tipos-producto/",
        json={"nombre": "motor"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    resp = client.post(
        "/api/productos/",
        json={"nombre": "Bomba dual", "tipos": [t1["id"], t2["id"]]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert {t["id"] for t in data["tipos"]} == {t1["id"], t2["id"]}


def test_actualizar_tipos_producto(client, admin_token):
    t1 = client.post(
        "/api/tipos-producto/",
        json={"nombre": "hidraulico"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    t2 = client.post(
        "/api/tipos-producto/",
        json={"nombre": "transmision"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    p = client.post(
        "/api/productos/",
        json={"nombre": "Pieza", "tipos": [t1["id"]]},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    resp = client.patch(
        f"/api/productos/{p['id']}",
        json={"tipos": [t2["id"]]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert [t["id"] for t in resp.json()["tipos"]] == [t2["id"]]


def test_tipos_id_invalido_falla(client, admin_token):
    resp = client.post(
        "/api/productos/",
        json={"nombre": "X", "tipos": [99999]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


def test_filtro_productos_por_tipo_multivalor(client, admin_token):
    t_hid = client.post(
        "/api/tipos-producto/",
        json={"nombre": "hidraulico"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    t_mot = client.post(
        "/api/tipos-producto/",
        json={"nombre": "motor"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    t_tr = client.post(
        "/api/tipos-producto/",
        json={"nombre": "transmision"},
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    client.post(
        "/api/productos/",
        json={"nombre": "Solo hidraulico", "tipos": [t_hid["id"]]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    client.post(
        "/api/productos/",
        json={"nombre": "Solo motor", "tipos": [t_mot["id"]]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    client.post(
        "/api/productos/",
        json={"nombre": "Solo transmision", "tipos": [t_tr["id"]]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    resp = client.get(
        "/api/productos/?tipo=hidraulico&tipo=motor",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    nombres = {p["nombre"] for p in resp.json()}
    assert "Solo hidraulico" in nombres
    assert "Solo motor" in nombres
    assert "Solo transmision" not in nombres
