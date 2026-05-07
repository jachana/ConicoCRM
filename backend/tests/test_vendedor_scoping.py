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
