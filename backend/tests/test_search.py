def test_q_too_short_returns_422(client, admin_token):
    resp = client.get("/api/search?q=a", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_q_missing_returns_422(client, admin_token):
    resp = client.get("/api/search", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 422


def test_unauthenticated_returns_401(client):
    resp = client.get("/api/search?q=hola")
    assert resp.status_code == 401


def test_admin_empty_results(client, admin_token):
    resp = client.get("/api/search?q=zzznoexiste", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["q"] == "zzznoexiste"
    for cat in ["productos", "clientes", "empresas", "cotizaciones",
                "notas_venta", "facturas", "ordenes_compra", "empleados"]:
        assert cat in body and body[cat] == []


def test_match_producto_by_nombre(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="Tornillo M8", sku="TOR-008", precio_venta=100, precio_costo=50)
    db.add(p); db.commit()
    resp = client.get("/api/search?q=tor", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    items = resp.json()["productos"]
    assert any(it["sku"] == "TOR-008" for it in items)


def test_match_producto_by_sku(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="Pieza X", sku="ABC-123", precio_venta=100, precio_costo=50)
    db.add(p); db.commit()
    resp = client.get("/api/search?q=ABC", headers={"Authorization": f"Bearer {admin_token}"})
    items = resp.json()["productos"]
    assert any(it["sku"] == "ABC-123" for it in items)


def test_match_cliente_by_nombre_and_rut(client, admin_token, db):
    from app.models.cliente import Cliente
    c = Cliente(nombre="Juan Pérez", rut="12.345.678-9")
    db.add(c); db.commit()
    by_name = client.get("/api/search?q=Juan", headers={"Authorization": f"Bearer {admin_token}"})
    by_rut = client.get("/api/search?q=12.345", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["rut"] == "12.345.678-9" for it in by_name.json()["clientes"])
    assert any(it["rut"] == "12.345.678-9" for it in by_rut.json()["clientes"])


def test_match_cliente_by_empresa_nombre(client, admin_token, db):
    from app.models.cliente import Cliente
    from app.models.empresa import Empresa
    e = Empresa(nombre="Constructora Andes", rut="76.999.888-1")
    db.add(e); db.commit(); db.refresh(e)
    c = Cliente(nombre="Pedro Soto", rut="9.876.543-2", empresa_id=e.id)
    db.add(c); db.commit()
    resp = client.get("/api/search?q=Andes", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    items = resp.json()["clientes"]
    assert any(it["rut"] == "9.876.543-2" and it["empresa"] == "Constructora Andes" for it in items)


def test_listar_clientes_filters_by_empresa_nombre(client, admin_token, db):
    from app.models.cliente import Cliente
    from app.models.empresa import Empresa
    e = Empresa(nombre="Mineria Norte SpA", rut="76.555.444-3")
    db.add(e); db.commit(); db.refresh(e)
    c = Cliente(nombre="Ana Riquelme", rut="8.111.222-3", empresa_id=e.id)
    db.add(c); db.commit()
    resp = client.get("/api/clientes/?q=Norte", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    items = resp.json()
    assert any(it["rut"] == "8.111.222-3" for it in items)


def test_match_empresa_by_nombre_and_rut(client, admin_token, db):
    from app.models.empresa import Empresa
    e = Empresa(nombre="ACME Corp", rut="76.123.456-7")
    db.add(e); db.commit()
    resp = client.get("/api/search?q=ACME", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["nombre"] == "ACME Corp" for it in resp.json()["empresas"])


def test_limit_per_category(client, admin_token, db):
    from app.models.producto import Producto
    for i in range(8):
        db.add(Producto(nombre=f"Sierra {i}", sku=f"SI-{i:03}", precio_venta=10, precio_costo=5))
    db.commit()
    resp = client.get("/api/search?q=Sierra&limit=5", headers={"Authorization": f"Bearer {admin_token}"})
    assert len(resp.json()["productos"]) == 5


def test_match_cotizacion_by_numero(client, admin_token, admin_user, cliente_demo, db):
    from app.models.cotizacion import Cotizacion
    cot = Cotizacion(numero=12345, cliente_id=cliente_demo.id, vendedor_id=admin_user.id, estado="abierta")
    db.add(cot); db.commit()
    resp = client.get("/api/search?q=12345", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["numero"] == 12345 for it in resp.json()["cotizaciones"])


def test_vendedor_sees_only_own_cotizaciones(client, vendedor_token, vendedor_user, admin_user, cliente_demo, db):
    from app.models.cotizacion import Cotizacion
    own = Cotizacion(numero=11111, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id, estado="abierta")
    other = Cotizacion(numero=22222, cliente_id=cliente_demo.id, vendedor_id=admin_user.id, estado="abierta")
    db.add_all([own, other]); db.commit()
    own_q = client.get("/api/search?q=11111", headers={"Authorization": f"Bearer {vendedor_token}"})
    other_q = client.get("/api/search?q=22222", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert any(it["numero"] == 11111 for it in own_q.json()["cotizaciones"])
    assert all(it["numero"] != 22222 for it in other_q.json()["cotizaciones"])


def test_match_factura_by_numero_and_state(client, admin_token, cliente_demo, db):
    from app.models.factura import Factura
    f = Factura(numero=200, cliente_id=cliente_demo.id, estado="pagada")
    db.add(f); db.commit()
    resp = client.get("/api/search?q=200", headers={"Authorization": f"Bearer {admin_token}"})
    items = resp.json()["facturas"]
    assert any(it["numero"] == 200 and it["estado"] == "pagada" for it in items)


def test_match_orden_compra_by_numero(client, admin_token, db):
    from app.models.orden_compra import OrdenCompra
    from app.models.proveedor import Proveedor
    p = Proveedor(nombre="Prov X")
    db.add(p); db.commit(); db.refresh(p)
    oc = OrdenCompra(numero=50, proveedor_id=p.id, estado="borrador")
    db.add(oc); db.commit()
    resp = client.get("/api/search?q=50", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["numero"] == 50 for it in resp.json()["ordenes_compra"])


def test_match_empleado_by_nombre(client, admin_token, db):
    from app.models.empleado import Empleado
    e = Empleado(nombre="María González", cargo="Vendedora")
    db.add(e); db.commit()
    resp = client.get("/api/search?q=Mar", headers={"Authorization": f"Bearer {admin_token}"})
    assert any(it["nombre"] == "María González" for it in resp.json()["empleados"])


def test_user_without_rrhh_omits_empleados_key(client, vendedor_token, db):
    from app.models.empleado import Empleado
    db.add(Empleado(nombre="Pedro", cargo="X")); db.commit()
    resp = client.get("/api/search?q=Pedro", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert "empleados" not in body
