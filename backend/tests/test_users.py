def test_list_users_authenticated(client, admin_token):
    resp = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_list_users_unauthenticated(client):
    resp = client.get("/api/users")
    assert resp.status_code == 401

def test_create_user(client, admin_token):
    resp = client.post("/api/users", json={
        "email": "new@conico.cl", "name": "New", "password": "pass123", "role": "vendedor"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 201
    assert resp.json()["email"] == "new@conico.cl"
    assert resp.json()["role"] == "vendedor"

def test_create_duplicate_user(client, admin_token, admin_user):
    resp = client.post("/api/users", json={
        "email": "admin@conico.cl", "name": "Dup", "password": "x", "role": "vendedor"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 409

def test_update_user(client, admin_token, admin_user):
    resp = client.patch(f"/api/users/{admin_user.id}", json={"name": "Updated"},
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"

def test_get_permissions(client, admin_token, admin_user):
    resp = client.get(f"/api/users/{admin_user.id}/permissions",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "catalogo" in data
    assert {"view", "create", "edit", "delete"} <= data["catalogo"].keys()

def test_set_permissions(client, admin_token):
    uid = client.post("/api/users", json={
        "email": "v@conico.cl", "name": "V", "password": "x", "role": "vendedor"
    }, headers={"Authorization": f"Bearer {admin_token}"}).json()["id"]
    resp = client.put(f"/api/users/{uid}/permissions",
                      json={"inventario": {"view": True, "create": False, "edit": False, "delete": False}},
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["inventario"]["view"] is True


def test_desactivar_user_reasigna_tareas_a_admin(client, admin_token, admin_user, vendedor_user, db):
    from datetime import date
    from app.models.tarea import Tarea
    t = Tarea(
        titulo="huerfana-futura",
        due_date=date.today(),
        origen="manual",
        asignado_id=vendedor_user.id,
    )
    db.add(t); db.commit()
    tarea_id = t.id

    resp = client.patch(
        f"/api/users/{vendedor_user.id}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    db.expire_all()
    t_reloaded = db.query(Tarea).filter(Tarea.id == tarea_id).first()
    assert t_reloaded.asignado_id == admin_user.id
