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


def _crear_producto(db, nombre="Prod", stock_actual=10, stock_minimo=5, precio_costo=500):
    """Creates a Producto directly via the ORM session.

    Uses `db` fixture to avoid spawning separate connections that contaminate the
    SQLite pool. precio_costo is NOT exposed via ProductoCreate schema — we set it
    directly on the model for tests that depend on the costo=0 guard in NV creation.
    """
    from decimal import Decimal
    from app.models.producto import Producto
    p = Producto(
        nombre=nombre,
        precio_venta=Decimal("1000"),
        precio_costo=Decimal(str(precio_costo)),
        stock_minimo=stock_minimo,
        stock_actual=stock_actual,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p.id


def test_ajuste_suma_stock(client, admin_token, db):
    pid = _crear_producto(db, stock_actual=10)
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


def test_ajuste_resta_stock(client, admin_token, db):
    pid = _crear_producto(db, stock_actual=10)
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 3, "signo": -1, "motivo": "merma"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 7


def test_ajuste_stock_negativo_rechazado(client, admin_token, db):
    pid = _crear_producto(db, stock_actual=5)
    r = client.post(
        "/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 10, "signo": -1, "motivo": "merma"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 5  # unchanged


def test_ajuste_motivo_invalido(client, admin_token, db):
    pid = _crear_producto(db)
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


def test_stock_bajo_detecta_criticos(client, admin_token, db):
    _crear_producto(db, nombre="Critico", stock_actual=2, stock_minimo=10)
    _crear_producto(db, nombre="OK", stock_actual=20, stock_minimo=5)
    r = client.get("/api/inventario/stock-bajo", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert "Critico" in nombres
    assert "OK" not in nombres


def test_listar_movimientos_paginado(client, admin_token, db):
    pid = _crear_producto(db)
    client.post("/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 1, "signo": 1, "motivo": "conteo_fisico"},
        headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/inventario/movimientos?page=1&page_size=50",
        headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


def test_listar_movimientos_filtro_tipo(client, admin_token, db):
    pid = _crear_producto(db)
    client.post("/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 1, "signo": 1, "motivo": "otro"},
        headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/inventario/movimientos?tipo=ajuste",
        headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["tipo"] == "ajuste"


def test_recepcion_oc_crea_movimiento_entrada(client, admin_token, db):
    # Create provider
    r = client.post(
        "/api/proveedores/",
        json={"nombre": "ProvOC", "rut": None, "email": "prov_oc@test.cl"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201, f"Provider creation failed: {r.status_code} - {r.json()}"
    pid_prov = r.json()["id"]

    pid_prod = _crear_producto(db, nombre="ProdOC", stock_actual=0)

    oc = client.post(
        "/api/ordenes-compra/",
        json={
            "proveedor_id": pid_prov,
            "fecha": "2026-04-19",
            "lineas": [{"orden": 1, "descripcion": "ProdOC", "cantidad": 5,
                         "valor_neto": 1000, "producto_id": pid_prod}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()
    oc_id = oc["id"]
    linea_id = oc["lineas"][0]["id"]

    # set estado enviada directly (API only allows borrador→cancelada)
    from app.models.orden_compra import OrdenCompra
    from tests.conftest import TestingSession
    _db = TestingSession()
    _oc = _db.get(OrdenCompra, oc_id)
    _oc.estado = "enviada"
    _db.commit()
    _db.close()

    # recepcionar
    client.post(f"/api/ordenes-compra/{oc_id}/recepcionar",
        json={"lineas": [{"id": linea_id, "cantidad_recibida": 5}]},
        headers={"Authorization": f"Bearer {admin_token}"})

    # stock_actual actualizado
    prod = client.get(f"/api/productos/{pid_prod}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 5

    # movimiento creado
    movs = client.get(f"/api/inventario/movimientos?producto_id={pid_prod}",
        headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert movs["total"] == 1
    m = movs["items"][0]
    assert m["tipo"] == "entrada"
    assert m["cantidad"] == 5
    assert m["signo"] == 1
    assert m["referencia_tipo"] == "orden_compra"
    assert m["referencia_id"] == oc_id


def _crear_nv(client, token, producto_id: int, cantidad: int = 3):
    cli = client.post("/api/clientes/",
        json={"nombre": "CLI Test", "rut": None},
        headers={"Authorization": f"Bearer {token}"}).json()["id"]
    return client.post("/api/nota_ventas/",
        json={
            "cliente_id": cli,
            "fecha": "2026-04-19",
            "retiro_en_conico": True,
            "lineas": [{"orden": 1, "descripcion": "Item", "cantidad": cantidad,
                         "valor_neto": 1000, "producto_id": producto_id}],
        },
        headers={"Authorization": f"Bearer {token}"}).json()


def test_crear_nv_descuenta_stock(client, admin_token, db):
    pid = _crear_producto(db, nombre="ProdNV", stock_actual=20)
    nv = _crear_nv(client, admin_token, pid, cantidad=3)
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 17
    movs = client.get(f"/api/inventario/movimientos?producto_id={pid}",
        headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert movs["total"] == 1
    m = movs["items"][0]
    assert m["tipo"] == "salida"
    assert m["cantidad"] == 3
    assert m["signo"] == -1
    assert m["referencia_tipo"] == "nota_venta"
    assert m["referencia_id"] == nv["id"]


def test_reemplazar_lineas_nv_ajusta_stock(client, admin_token, db):
    pid = _crear_producto(db, nombre="ProdLineas", stock_actual=20)
    nv = _crear_nv(client, admin_token, pid, cantidad=3)
    # stock now 17; replace with cantidad=5 → delta +2 more sold → stock = 15
    client.put(f"/api/nota_ventas/{nv['id']}/lineas",
        json=[{"orden": 1, "descripcion": "Item", "cantidad": 5,
               "valor_neto": 1000, "producto_id": pid}],
        headers={"Authorization": f"Bearer {admin_token}"})
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 15
    movs = client.get(f"/api/inventario/movimientos?producto_id={pid}",
        headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert movs["total"] == 2


def test_cancelar_nv_restaura_stock(client, admin_token, db):
    pid = _crear_producto(db, nombre="ProdCancel", stock_actual=20)
    nv = _crear_nv(client, admin_token, pid, cantidad=3)
    # stock now 17
    client.patch(f"/api/nota_ventas/{nv['id']}/estado",
        json={"estado": "cancelada"},
        headers={"Authorization": f"Bearer {admin_token}"})
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 20
    movs = client.get(f"/api/inventario/movimientos?producto_id={pid}",
        headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert movs["total"] == 2  # salida + devolución


def test_eliminar_nv_restaura_stock(client, admin_token, db):
    pid = _crear_producto(db, nombre="ProdDel", stock_actual=20)
    nv = _crear_nv(client, admin_token, pid, cantidad=3)
    # stock now 17
    client.delete(f"/api/nota_ventas/{nv['id']}",
        headers={"Authorization": f"Bearer {admin_token}"})
    prod = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"}).json()
    assert prod["stock_actual"] == 20


def test_historial_por_producto(client, admin_token, db):
    pid = _crear_producto(db, nombre="ProdHistorial", stock_actual=10)
    client.post("/api/inventario/ajustes",
        json={"producto_id": pid, "cantidad": 2, "signo": 1, "motivo": "otro"},
        headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/productos/{pid}/movimientos",
        headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["producto_id"] == pid
