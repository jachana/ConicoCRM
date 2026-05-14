"""Historial de ventas de un producto: union NV/Factura/Boleta con scope vendedor."""


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_producto(client, token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod Hist", "sku": "PH-1", "precio_venta": "1000"},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _make_nv(client, token, cliente_id, producto_id, cantidad=2, valor=500):
    r = client.post(
        "/api/nota_ventas/",
        json={
            "cliente_id": cliente_id,
            "retiro_en_conico": True,
            "lineas": [{
                "orden": 1, "descripcion": "L1",
                "producto_id": producto_id, "cantidad": cantidad, "valor_neto": valor,
            }],
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_404_producto_inexistente(client, admin_token):
    r = client.get("/api/productos/999999/historial-ventas", headers=_auth(admin_token))
    assert r.status_code == 404


def test_historial_vacio(client, admin_token):
    prod = _make_producto(client, admin_token)
    r = client.get(f"/api/productos/{prod['id']}/historial-ventas", headers=_auth(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_admin_ve_todas_las_ventas(client, admin_token):
    prod = _make_producto(client, admin_token)

    rc1 = client.post("/api/clientes/", json={"nombre": "Cli 1"}, headers=_auth(admin_token))
    cid1 = rc1.json()["id"]
    rc2 = client.post("/api/clientes/", json={"nombre": "Cli 2"}, headers=_auth(admin_token))
    cid2 = rc2.json()["id"]

    _make_nv(client, admin_token, cid1, prod["id"], cantidad=3, valor=1000)
    _make_nv(client, admin_token, cid2, prod["id"], cantidad=5, valor=2000)

    r = client.get(f"/api/productos/{prod['id']}/historial-ventas", headers=_auth(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    nombres = {it["cliente_nombre"] for it in body["items"]}
    assert nombres == {"Cli 1", "Cli 2"}


def test_vendedor_ve_solo_sus_ventas(client, admin_token, vendedor_user, vendedor_token):
    prod = _make_producto(client, admin_token)

    # cliente asignado al vendedor
    rc_mio = client.post("/api/clientes/", json={"nombre": "Cli Mio"}, headers=_auth(admin_token))
    cid_mio = rc_mio.json()["id"]
    client.patch(f"/api/clientes/{cid_mio}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    # cliente ajeno
    rc_ajeno = client.post("/api/clientes/", json={"nombre": "Cli Ajeno"}, headers=_auth(admin_token))
    cid_ajeno = rc_ajeno.json()["id"]

    # admin crea NV para ambos
    _make_nv(client, admin_token, cid_mio, prod["id"])
    _make_nv(client, admin_token, cid_ajeno, prod["id"])

    r = client.get(f"/api/productos/{prod['id']}/historial-ventas", headers=_auth(vendedor_token))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["cliente_nombre"] == "Cli Mio"


def test_vendedor_ve_via_empresa_asignada(client, admin_token, vendedor_user, vendedor_token):
    prod = _make_producto(client, admin_token)

    re = client.post("/api/empresas/", json={"nombre": "Emp V", "rut": "88.888.888-8"}, headers=_auth(admin_token))
    eid = re.json()["id"]
    client.patch(f"/api/empresas/{eid}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    rc = client.post("/api/clientes/", json={"nombre": "Cli Emp", "empresa_id": eid}, headers=_auth(admin_token))
    cid = rc.json()["id"]
    _make_nv(client, admin_token, cid, prod["id"], cantidad=4, valor=750)

    r = client.get(f"/api/productos/{prod['id']}/historial-ventas", headers=_auth(vendedor_token))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    it = body["items"][0]
    assert it["cliente_nombre"] == "Cli Emp"
    assert it["empresa_nombre"] == "Emp V"
    assert it["doc_tipo"] == "NV"


def test_paginacion(client, admin_token):
    prod = _make_producto(client, admin_token)
    rc = client.post("/api/clientes/", json={"nombre": "Cli Pag"}, headers=_auth(admin_token))
    cid = rc.json()["id"]

    for _ in range(3):
        _make_nv(client, admin_token, cid, prod["id"])

    r = client.get(
        f"/api/productos/{prod['id']}/historial-ventas",
        params={"limit": 2, "offset": 0},
        headers=_auth(admin_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2

    r2 = client.get(
        f"/api/productos/{prod['id']}/historial-ventas",
        params={"limit": 2, "offset": 2},
        headers=_auth(admin_token),
    )
    assert r2.status_code == 200
    assert len(r2.json()["items"]) == 1


def test_totales_respetan_scope(client, admin_token, vendedor_user, vendedor_token):
    prod = _make_producto(client, admin_token)

    rc_mio = client.post("/api/clientes/", json={"nombre": "Cli Mio2"}, headers=_auth(admin_token))
    cid_mio = rc_mio.json()["id"]
    client.patch(f"/api/clientes/{cid_mio}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    rc_ajeno = client.post("/api/clientes/", json={"nombre": "Cli Ajeno2"}, headers=_auth(admin_token))
    cid_ajeno = rc_ajeno.json()["id"]

    _make_nv(client, admin_token, cid_mio, prod["id"], cantidad=2, valor=1000)
    _make_nv(client, admin_token, cid_ajeno, prod["id"], cantidad=100, valor=1000)

    r = client.get(f"/api/productos/{prod['id']}/historial-ventas", headers=_auth(vendedor_token))
    body = r.json()
    assert body["total"] == 1
    assert float(body["total_cantidad"]) == 2.0
