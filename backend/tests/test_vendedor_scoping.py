"""Vendedor scoping: vendor sees only Empresas/Clientes assigned to them.

Adds vendedor_id FK on Empresa and Cliente. List/detail endpoints filter
by current_user.id when role == 'vendedor'. Admin/subadmin see all.
"""


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- Empresa scoping ---

def test_vendedor_lista_solo_empresas_asignadas(client, admin_token, vendedor_user, vendedor_token):
    # admin creates two empresas, assigns one to vendedor
    r1 = client.post("/api/empresas/", json={"nombre": "Empresa A", "rut": "11.111.111-1"}, headers=_auth(admin_token))
    assert r1.status_code == 201
    eid_assigned = r1.json()["id"]

    r2 = client.post("/api/empresas/", json={"nombre": "Empresa B", "rut": "22.222.222-2"}, headers=_auth(admin_token))
    assert r2.status_code == 201

    # admin assigns Empresa A to vendedor
    rp = client.patch(f"/api/empresas/{eid_assigned}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))
    assert rp.status_code == 200
    assert rp.json()["vendedor_id"] == vendedor_user.id

    # vendedor lists -> only Empresa A
    rl = client.get("/api/empresas/", headers=_auth(vendedor_token))
    assert rl.status_code == 200
    nombres = {e["nombre"] for e in rl.json()}
    assert nombres == {"Empresa A"}

    # admin lists -> sees both
    ra = client.get("/api/empresas/", headers=_auth(admin_token))
    assert ra.status_code == 200
    assert {e["nombre"] for e in ra.json()} >= {"Empresa A", "Empresa B"}


def test_vendedor_403_en_empresa_no_asignada(client, admin_token, vendedor_token):
    r = client.post("/api/empresas/", json={"nombre": "Otra", "rut": "33.333.333-3"}, headers=_auth(admin_token))
    eid = r.json()["id"]

    rg = client.get(f"/api/empresas/{eid}", headers=_auth(vendedor_token))
    assert rg.status_code == 403


def test_vendedor_acceso_empresa_asignada(client, admin_token, vendedor_user, vendedor_token):
    r = client.post("/api/empresas/", json={"nombre": "Mi Empresa", "rut": "44.444.444-4"}, headers=_auth(admin_token))
    eid = r.json()["id"]
    client.patch(f"/api/empresas/{eid}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    rg = client.get(f"/api/empresas/{eid}", headers=_auth(vendedor_token))
    assert rg.status_code == 200
    assert rg.json()["nombre"] == "Mi Empresa"


def test_vendedor_no_puede_reasignar_empresa(client, admin_token, vendedor_user, vendedor_token):
    r = client.post("/api/empresas/", json={"nombre": "X", "rut": "55.555.555-5"}, headers=_auth(admin_token))
    eid = r.json()["id"]
    client.patch(f"/api/empresas/{eid}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    # vendedor tries to assign to a different user
    rp = client.patch(f"/api/empresas/{eid}", json={"vendedor_id": 99999}, headers=_auth(vendedor_token))
    assert rp.status_code == 403


# --- Cliente scoping ---

def test_vendedor_lista_solo_clientes_asignados_directo(client, admin_token, vendedor_user, vendedor_token):
    r1 = client.post("/api/clientes/", json={"nombre": "Cli A"}, headers=_auth(admin_token))
    cid_a = r1.json()["id"]
    client.post("/api/clientes/", json={"nombre": "Cli B"}, headers=_auth(admin_token))

    # admin assigns Cli A to vendedor
    client.patch(f"/api/clientes/{cid_a}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    rl = client.get("/api/clientes/", headers=_auth(vendedor_token))
    assert rl.status_code == 200
    nombres = {c["nombre"] for c in rl.json()}
    assert nombres == {"Cli A"}


def test_vendedor_lista_clientes_via_empresa_asignada(client, admin_token, vendedor_user, vendedor_token):
    # empresa assigned to vendedor; cliente belongs to that empresa but cliente.vendedor_id is null
    re = client.post("/api/empresas/", json={"nombre": "Emp Asignada", "rut": "77.777.777-7"}, headers=_auth(admin_token))
    eid = re.json()["id"]
    client.patch(f"/api/empresas/{eid}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    client.post("/api/clientes/", json={"nombre": "Cli de Empresa", "empresa_id": eid}, headers=_auth(admin_token))
    client.post("/api/clientes/", json={"nombre": "Cli Huerfano"}, headers=_auth(admin_token))

    rl = client.get("/api/clientes/", headers=_auth(vendedor_token))
    assert rl.status_code == 200
    nombres = {c["nombre"] for c in rl.json()}
    assert nombres == {"Cli de Empresa"}


def test_vendedor_403_cliente_no_asignado(client, admin_token, vendedor_token):
    r = client.post("/api/clientes/", json={"nombre": "Otro Cli"}, headers=_auth(admin_token))
    cid = r.json()["id"]
    rg = client.get(f"/api/clientes/{cid}", headers=_auth(vendedor_token))
    assert rg.status_code == 403


def test_cliente_creado_por_vendedor_se_autoasigna(client, vendedor_user, vendedor_token):
    r = client.post("/api/clientes/", json={"nombre": "Self Cli"}, headers=_auth(vendedor_token))
    assert r.status_code == 201
    assert r.json()["vendedor_id"] == vendedor_user.id


def test_admin_ve_todos_los_clientes(client, admin_token, vendedor_user, vendedor_token):
    client.post("/api/clientes/", json={"nombre": "C1"}, headers=_auth(admin_token))
    client.post("/api/clientes/", json={"nombre": "C2"}, headers=_auth(vendedor_token))

    r = client.get("/api/clientes/", headers=_auth(admin_token))
    assert r.status_code == 200
    nombres = {c["nombre"] for c in r.json()}
    assert {"C1", "C2"} <= nombres


# --- Nota de Venta scoping ---

def _make_nv(client, token, cliente_id):
    r = client.post(
        "/api/nota_ventas/",
        json={"cliente_id": cliente_id, "retiro_en_conico": True},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_vendedor_lista_solo_nv_de_clientes_asignados(client, admin_token, vendedor_user, vendedor_token):
    # admin creates two clientes, assigns one to vendedor
    rc1 = client.post("/api/clientes/", json={"nombre": "Cli Mio"}, headers=_auth(admin_token))
    cid_mio = rc1.json()["id"]
    client.patch(f"/api/clientes/{cid_mio}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    rc2 = client.post("/api/clientes/", json={"nombre": "Cli Ajeno"}, headers=_auth(admin_token))
    cid_ajeno = rc2.json()["id"]

    # admin creates NV for each
    nv_mio = _make_nv(client, admin_token, cid_mio)
    nv_ajeno = _make_nv(client, admin_token, cid_ajeno)

    # vendedor lists -> only NV of Cli Mio
    rl = client.get("/api/nota_ventas/", headers=_auth(vendedor_token))
    assert rl.status_code == 200
    ids = {nv["id"] for nv in rl.json()["data"]}
    assert nv_mio["id"] in ids
    assert nv_ajeno["id"] not in ids


def test_vendedor_lista_nv_via_empresa_asignada(client, admin_token, vendedor_user, vendedor_token):
    # empresa asignada al vendedor, cliente bajo esa empresa
    re = client.post("/api/empresas/", json={"nombre": "Emp V", "rut": "88.888.888-8"}, headers=_auth(admin_token))
    eid = re.json()["id"]
    client.patch(f"/api/empresas/{eid}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    rc = client.post("/api/clientes/", json={"nombre": "Cli Emp", "empresa_id": eid}, headers=_auth(admin_token))
    cid = rc.json()["id"]
    nv = _make_nv(client, admin_token, cid)

    rl = client.get("/api/nota_ventas/", headers=_auth(vendedor_token))
    assert rl.status_code == 200
    ids = {item["id"] for item in rl.json()["data"]}
    assert nv["id"] in ids


def test_vendedor_403_en_nv_de_cliente_no_asignado(client, admin_token, vendedor_token):
    rc = client.post("/api/clientes/", json={"nombre": "Cli Otro"}, headers=_auth(admin_token))
    cid = rc.json()["id"]
    nv = _make_nv(client, admin_token, cid)

    rg = client.get(f"/api/nota_ventas/{nv['id']}", headers=_auth(vendedor_token))
    assert rg.status_code == 403


def test_vendedor_acceso_nv_de_cliente_asignado(client, admin_token, vendedor_user, vendedor_token):
    rc = client.post("/api/clientes/", json={"nombre": "Cli Mio2"}, headers=_auth(admin_token))
    cid = rc.json()["id"]
    client.patch(f"/api/clientes/{cid}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))
    nv = _make_nv(client, admin_token, cid)

    rg = client.get(f"/api/nota_ventas/{nv['id']}", headers=_auth(vendedor_token))
    assert rg.status_code == 200
    assert rg.json()["id"] == nv["id"]


# --- Factura scoping ---

def _make_factura(client, token, cliente_id, lineas=None):
    if lineas is None:
        lineas = [{"orden": 0, "descripcion": "Item", "cantidad": 1, "valor_neto": 1000}]
    r = client.post(
        "/api/facturas/",
        json={"cliente_id": cliente_id, "correo": "f@test.com", "lineas": lineas},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_vendedor_lista_solo_facturas_de_clientes_asignados(client, admin_token, vendedor_user, vendedor_token):
    rc1 = client.post("/api/clientes/", json={"nombre": "Cli Fac Mio"}, headers=_auth(admin_token))
    cid_mio = rc1.json()["id"]
    client.patch(f"/api/clientes/{cid_mio}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    rc2 = client.post("/api/clientes/", json={"nombre": "Cli Fac Ajeno"}, headers=_auth(admin_token))
    cid_ajeno = rc2.json()["id"]

    f_mio = _make_factura(client, admin_token, cid_mio)
    f_ajeno = _make_factura(client, admin_token, cid_ajeno)

    rl = client.get("/api/facturas/", headers=_auth(vendedor_token))
    assert rl.status_code == 200
    ids = {f["id"] for f in rl.json()["data"]}
    assert f_mio["id"] in ids
    assert f_ajeno["id"] not in ids


def test_vendedor_lista_facturas_via_empresa_asignada(client, admin_token, vendedor_user, vendedor_token):
    re = client.post("/api/empresas/", json={"nombre": "Emp Fac V", "rut": "66.666.666-6"}, headers=_auth(admin_token))
    eid = re.json()["id"]
    client.patch(f"/api/empresas/{eid}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))

    rc = client.post("/api/clientes/", json={"nombre": "Cli Emp Fac", "empresa_id": eid}, headers=_auth(admin_token))
    cid = rc.json()["id"]
    f = _make_factura(client, admin_token, cid)

    rl = client.get("/api/facturas/", headers=_auth(vendedor_token))
    assert rl.status_code == 200
    ids = {item["id"] for item in rl.json()["data"]}
    assert f["id"] in ids


def test_vendedor_403_factura_de_cliente_no_asignado(client, admin_token, vendedor_token):
    rc = client.post("/api/clientes/", json={"nombre": "Cli Fac Otro"}, headers=_auth(admin_token))
    cid = rc.json()["id"]
    f = _make_factura(client, admin_token, cid)

    rg = client.get(f"/api/facturas/{f['id']}", headers=_auth(vendedor_token))
    assert rg.status_code == 403


def test_vendedor_acceso_factura_de_cliente_asignado(client, admin_token, vendedor_user, vendedor_token):
    rc = client.post("/api/clientes/", json={"nombre": "Cli Fac Mio2"}, headers=_auth(admin_token))
    cid = rc.json()["id"]
    client.patch(f"/api/clientes/{cid}", json={"vendedor_id": vendedor_user.id}, headers=_auth(admin_token))
    f = _make_factura(client, admin_token, cid)

    rg = client.get(f"/api/facturas/{f['id']}", headers=_auth(vendedor_token))
    assert rg.status_code == 200
    assert rg.json()["id"] == f["id"]


def test_admin_ve_todas_las_facturas(client, admin_token, vendedor_user, vendedor_token):
    rc1 = client.post("/api/clientes/", json={"nombre": "Cli Fac Admin"}, headers=_auth(admin_token))
    cid1 = rc1.json()["id"]
    rc2 = client.post("/api/clientes/", json={"nombre": "Cli Fac Vend"}, headers=_auth(vendedor_token))
    cid2 = rc2.json()["id"]

    f1 = _make_factura(client, admin_token, cid1)
    f2 = _make_factura(client, admin_token, cid2)

    rl = client.get("/api/facturas/", headers=_auth(admin_token))
    assert rl.status_code == 200
    ids = {item["id"] for item in rl.json()["data"]}
    assert {f1["id"], f2["id"]} <= ids


def test_admin_ve_todas_las_nv(client, admin_token, vendedor_user, vendedor_token):
    rc1 = client.post("/api/clientes/", json={"nombre": "C-admin"}, headers=_auth(admin_token))
    cid1 = rc1.json()["id"]
    rc2 = client.post("/api/clientes/", json={"nombre": "C-vend"}, headers=_auth(vendedor_token))
    cid2 = rc2.json()["id"]

    nv1 = _make_nv(client, admin_token, cid1)
    nv2 = _make_nv(client, vendedor_token, cid2)

    rl = client.get("/api/nota_ventas/", headers=_auth(admin_token))
    assert rl.status_code == 200
    ids = {item["id"] for item in rl.json()["data"]}
    assert {nv1["id"], nv2["id"]} <= ids
