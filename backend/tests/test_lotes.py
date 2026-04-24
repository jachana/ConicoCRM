def test_lotes_vacios_sin_recepciones(client, admin_token):
    prod = client.post("/api/productos/", json={"nombre": "ProdLote", "precio_venta": "10"},
                       headers={"Authorization": f"Bearer {admin_token}"}).json()
    resp = client.get(f"/api/productos/{prod['id']}/lotes",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_historial_paginado(client, admin_token):
    prod = client.post("/api/productos/", json={"nombre": "ProdHist", "precio_venta": "10"},
                       headers={"Authorization": f"Bearer {admin_token}"}).json()
    resp = client.get(f"/api/productos/{prod['id']}/movimientos?page=1&page_size=10",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert data["page"] == 1
    assert data["page_size"] == 10


def test_exportar_csv(client, admin_token):
    prod = client.post("/api/productos/", json={"nombre": "ProdCSV", "precio_venta": "10"},
                       headers={"Authorization": f"Bearer {admin_token}"}).json()
    resp = client.get(f"/api/productos/{prod['id']}/movimientos/export",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
