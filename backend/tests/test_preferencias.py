def test_get_returns_defaults_for_new_user(client, admin_token):
    resp = client.get("/api/users/me/preferencias", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"busqueda_boton_visible": True, "busqueda_atajo": "ctrl_k"}
