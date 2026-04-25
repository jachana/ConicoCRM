def test_get_returns_defaults_for_new_user(client, admin_token):
    resp = client.get("/api/users/me/preferencias", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"busqueda_boton_visible": True, "busqueda_atajo": "ctrl_k"}


def test_patch_updates_partial_preserves_other_keys(client, admin_token):
    resp = client.patch(
        "/api/users/me/preferencias",
        json={"busqueda_atajo": "alt_s"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["busqueda_atajo"] == "alt_s"
    assert body["busqueda_boton_visible"] is True

    resp = client.get("/api/users/me/preferencias", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()["busqueda_atajo"] == "alt_s"


def test_patch_invalid_atajo_returns_422(client, admin_token):
    resp = client.patch(
        "/api/users/me/preferencias",
        json={"busqueda_atajo": "ctrl_x"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_get_unauthenticated_returns_401(client):
    resp = client.get("/api/users/me/preferencias")
    assert resp.status_code == 401


def test_patch_unauthenticated_returns_401(client):
    resp = client.patch("/api/users/me/preferencias", json={"busqueda_atajo": "alt_s"})
    assert resp.status_code == 401
