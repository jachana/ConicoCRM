def test_modelo_importable():
    from app.models.movimiento_inventario import MovimientoInventario
    assert MovimientoInventario.__tablename__ == "movimientos_inventario"


def test_listar_movimientos_sin_auth(client):
    r = client.get("/api/inventario/movimientos")
    assert r.status_code == 401


def test_listar_movimientos_vacio(client, admin_token):
    r = client.get("/api/inventario/movimientos", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_stock_bajo_vacio(client, admin_token):
    r = client.get("/api/inventario/stock-bajo", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json() == []


def _crear_producto(client, token, nombre="Prod", stock_actual=10, stock_minimo=5):
    r = client.post(
        "/api/productos/",
        json={"nombre": nombre, "precio_costo": 0, "precio_venta": 0,
              "stock_minimo": stock_minimo, "stock_actual": stock_actual},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_ajuste_suma_stock(client, admin_token):
    pid = _crear_producto(client, admin_token, stock_actual=10)
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 5, "signo": 1, "motivo": "conteo_fisico"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["tipo"] == "ajuste"
    assert data["cantidad"] == 5
    assert data["signo"] == 1
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 15


def test_ajuste_resta_stock(client, admin_token):
    pid = _crear_producto(client, admin_token, stock_actual=10)
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 3, "signo": -1, "motivo": "merma"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 7


def test_ajuste_motivo_invalido(client, admin_token):
    pid = _crear_producto(client, admin_token)
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 1, "signo": 1, "motivo": "inventado"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_ajuste_vendedor_sin_permisos(client, vendedor_token):
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": 1, "cantidad": 1, "signo": 1, "motivo": "conteo_fisico"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


def test_stock_bajo_detecta_criticos(client, admin_token):
    _crear_producto(client, admin_token, nombre="Critico", stock_actual=2, stock_minimo=10)
    _crear_producto(client, admin_token, nombre="OK", stock_actual=20, stock_minimo=5)
    r = client.get("/api/inventario/stock-bajo", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert "Critico" in nombres
    assert "OK" not in nombres


def test_listar_movimientos_paginado(client, admin_token):
    pid = _crear_producto(client, admin_token)
    client.post("/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 1, "signo": 1, "motivo": "conteo_fisico"},
        headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/inventario/movimientos?page=1&page_size=50",
        headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


def test_listar_movimientos_filtro_tipo(client, admin_token):
    pid = _crear_producto(client, admin_token)
    client.post("/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 1, "signo": 1, "motivo": "otro"},
        headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/inventario/movimientos?tipo=ajuste",
        headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["tipo"] == "ajuste"
