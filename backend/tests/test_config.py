def test_config_seeds_dias_alerta_costo_desactualizado(client, admin_token):
    resp = client.get("/api/config/", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    items = {c["key"]: c["value"] for c in resp.json()}
    assert items.get("dias_alerta_costo_desactualizado") == "60"
