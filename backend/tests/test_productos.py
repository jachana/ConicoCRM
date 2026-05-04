import pytest


def test_listar_sin_autenticacion(client):
    r = client.get("/api/productos/")
    assert r.status_code == 401


def test_vendedor_puede_ver_productos(client, vendedor_token):
    r = client.get("/api/productos/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200


def test_vendedor_no_puede_crear_producto(client, vendedor_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod X", "precio_venta": "20.00"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


def test_crear_producto(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Tornillo M6", "descripcion": "Tornillo inoxidable", "precio_venta": "120.00", "stock_minimo": 10},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Tornillo M6"
    assert float(data["precio_venta"]) == 120.0


def test_crear_producto_con_proveedor(client, admin_token):
    prov = client.post(
        "/api/proveedores/",
        json={"nombre": "Prov Z"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    prov_id = prov.json()["id"]
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod con Prov", "precio_venta": "20.00", "proveedor_id": prov_id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["proveedor_id"] == prov_id


def test_buscar_productos(client, admin_token):
    client.post("/api/productos/", json={"nombre": "Perno hexagonal", "precio_venta": "10.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/productos/", json={"nombre": "Tuerca M8", "precio_venta": "6.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/productos/buscar?q=perno", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    resultados = r.json()
    assert len(resultados) == 1
    assert resultados[0]["nombre"] == "Perno hexagonal"


def test_actualizar_producto(client, admin_token):
    r = client.post("/api/productos/", json={"nombre": "Viejo", "precio_venta": "2.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.patch(
        f"/api/productos/{pid}",
        json={"nombre": "Nuevo", "precio_venta": "999.00"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["nombre"] == "Nuevo"
    assert float(r2.json()["precio_venta"]) == 999.0


def test_eliminar_producto(client, admin_token):
    r = client.post("/api/productos/", json={"nombre": "Para Borrar", "precio_venta": "2.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid = r.json()["id"]
    r2 = client.delete(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_exportar_excel_productos(client, admin_token):
    r = client.get("/api/productos/export/excel", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]


def test_producto_iva_computed(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Tornillo IVA", "precio_venta": "120.00"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert round(float(data["precio_con_iva"]), 2) == pytest.approx(142.80, abs=0.01)
    assert round(float(data["costo_con_iva"]), 2) == pytest.approx(0.00, abs=0.01)


def test_producto_con_marca(client, admin_token):
    marca_r = client.post(
        "/api/marcas/",
        json={"nombre": "MarcaTest"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert marca_r.status_code == 201
    marca_id = marca_r.json()["id"]

    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod con Marca", "precio_venta": "50.00", "marca_id": marca_id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["marca"] is not None
    assert data["marca"]["id"] == marca_id
    assert data["marca"]["nombre"] == "MarcaTest"


def test_producto_volumen(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Prod Volumen", "precio_venta": "30.00", "volumen": 5.5},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert float(data["volumen"]) == 5.5


def test_producto_precio_costo_actualizado_en_nullable_by_default(db):
    from app.models.producto import Producto
    p = Producto(nombre="Test", sku="X1")
    db.add(p); db.commit()
    db.refresh(p)
    assert p.precio_costo_actualizado_en is None


def test_producto_out_hides_cost_for_vendedor(client, vendedor_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="A", sku="X", precio_costo=Decimal("100"), precio_venta=Decimal("150"))
    db.add(p); db.commit()

    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert "precio_costo" not in body
    assert "costo_con_iva" not in body
    assert "precio_costo_actualizado_en" not in body
    assert "costo_desactualizado" not in body
    assert body["precio_venta"] == "150.00"


def test_producto_out_exposes_cost_for_admin(client, admin_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="A", sku="X", precio_costo=Decimal("100"))
    db.add(p); db.commit()

    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    body = resp.json()
    assert body["precio_costo"] == "100.00"
    assert "costo_con_iva" in body
    assert "costo_desactualizado" in body


def test_costo_desactualizado_true_when_null_fecha(client, admin_token, db):
    from app.models.producto import Producto
    p = Producto(nombre="A", sku="X")
    db.add(p); db.commit()
    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()["costo_desactualizado"] is True


def test_costo_desactualizado_false_when_recent(client, admin_token, db):
    from app.models.producto import Producto
    from datetime import datetime, timezone
    p = Producto(nombre="A", sku="X", precio_costo_actualizado_en=datetime.now(timezone.utc))
    db.add(p); db.commit()
    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()["costo_desactualizado"] is False


def test_buscar_productos_hides_cost_for_vendedor(client, vendedor_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="Alfa", sku="A1", precio_costo=Decimal("100"), precio_venta=Decimal("150"))
    db.add(p); db.commit()

    resp = client.get("/api/productos/buscar?q=A", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    resultados = resp.json()
    assert len(resultados) >= 1
    for item in resultados:
        assert "precio_costo" not in item


def test_buscar_productos_exposes_cost_for_admin(client, admin_token, db):
    from app.models.producto import Producto
    from decimal import Decimal
    p = Producto(nombre="Alfa", sku="A1", precio_costo=Decimal("100"), precio_venta=Decimal("150"))
    db.add(p); db.commit()

    resp = client.get("/api/productos/buscar?q=A", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    resultados = resp.json()
    assert len(resultados) >= 1
    for item in resultados:
        assert "precio_costo" in item


def test_costo_desactualizado_uses_fallback_when_config_invalid(client, admin_token, db):
    from app.models.producto import Producto
    from app.models.system_config import SystemConfig
    from datetime import datetime, timezone
    existing = db.get(SystemConfig, "dias_alerta_costo_desactualizado")
    if existing:
        db.delete(existing)
        db.commit()
    db.add(SystemConfig(key="dias_alerta_costo_desactualizado", value="banana"))
    db.commit()

    p = Producto(nombre="A", sku="X", precio_costo_actualizado_en=datetime.now(timezone.utc))
    db.add(p); db.commit()

    resp = client.get(f"/api/productos/{p.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["costo_desactualizado"] is False


def test_buscar_producto_insensible_tildes(client, admin_token):
    client.post("/api/productos/", json={"nombre": "Válvula hidráulica", "precio_venta": "50.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/productos/buscar?q=valvula", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(p["nombre"] == "Válvula hidráulica" for p in r.json())


def test_listar_q_busca_por_nombre(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    client.post("/api/productos/", json={"nombre": "Aceite hidraulico", "precio_venta": "10"}, headers=h)
    client.post("/api/productos/", json={"nombre": "Filtro de aire", "precio_venta": "20"}, headers=h)
    r = client.get("/api/productos/?q=aceite", headers=h)
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert "Aceite hidraulico" in nombres
    assert "Filtro de aire" not in nombres


def test_listar_q_busca_por_sku(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    client.post("/api/productos/", json={"nombre": "Producto SKU", "sku": "ABC-999", "precio_venta": "10"}, headers=h)
    client.post("/api/productos/", json={"nombre": "Otro", "sku": "ZZZ-001", "precio_venta": "10"}, headers=h)
    r = client.get("/api/productos/?q=ABC", headers=h)
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert nombres == ["Producto SKU"]


def test_listar_q_busca_por_marca(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    m = client.post("/api/marcas/", json={"nombre": "Bosch"}, headers=h).json()
    client.post("/api/productos/", json={"nombre": "Filtro premium", "marca_id": m["id"], "precio_venta": "10"}, headers=h)
    client.post("/api/productos/", json={"nombre": "Tornillo basic", "precio_venta": "5"}, headers=h)
    r = client.get("/api/productos/?q=bosch", headers=h)
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert "Filtro premium" in nombres
    assert "Tornillo basic" not in nombres


def test_listar_q_busca_por_tag(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    client.post("/api/productos/", json={"nombre": "Pieza A", "tags": ["motor"], "precio_venta": "10"}, headers=h)
    client.post("/api/productos/", json={"nombre": "Pieza B", "tags": ["frenos"], "precio_venta": "10"}, headers=h)
    r = client.get("/api/productos/?q=motor", headers=h)
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert "Pieza A" in nombres
    assert "Pieza B" not in nombres


def test_listar_q_busca_por_tipo(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    t = client.post("/api/tipos-producto/", json={"nombre": "hidraulico"}, headers=h).json()
    client.post("/api/productos/", json={"nombre": "Bomba X", "tipos": [t["id"]], "precio_venta": "10"}, headers=h)
    client.post("/api/productos/", json={"nombre": "Empaque Y", "precio_venta": "10"}, headers=h)
    r = client.get("/api/productos/?q=hidraulico", headers=h)
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()]
    assert "Bomba X" in nombres
    assert "Empaque Y" not in nombres


def test_listar_q_sin_resultados(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    client.post("/api/productos/", json={"nombre": "Cualquier producto", "precio_venta": "10"}, headers=h)
    r = client.get("/api/productos/?q=nonexistentxyz123", headers=h)
    assert r.status_code == 200
    assert r.json() == []


def test_listar_q_sin_duplicados_con_multiples_tags(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    client.post(
        "/api/productos/",
        json={"nombre": "MultiTag", "tags": ["motor", "transmision", "freno"], "precio_venta": "10"},
        headers=h,
    )
    r = client.get("/api/productos/?q=multi", headers=h)
    assert r.status_code == 200
    rows = r.json()
    nombres = [p["nombre"] for p in rows]
    assert nombres.count("MultiTag") == 1


def test_buscar_producto_por_marca(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    m = client.post("/api/marcas/", json={"nombre": "Shimano"}, headers=h).json()
    client.post("/api/productos/", json={"nombre": "Cadena bici", "marca_id": m["id"], "precio_venta": "10"}, headers=h)
    r = client.get("/api/productos/buscar?q=shimano", headers=h)
    assert r.status_code == 200
    assert any(p["nombre"] == "Cadena bici" for p in r.json())


def test_buscar_producto_por_tipo(client, admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    t = client.post("/api/tipos-producto/", json={"nombre": "neumatico"}, headers=h).json()
    client.post("/api/productos/", json={"nombre": "Llanta R15", "tipos": [t["id"]], "precio_venta": "10"}, headers=h)
    r = client.get("/api/productos/buscar?q=neumatico", headers=h)
    assert r.status_code == 200
    assert any(p["nombre"] == "Llanta R15" for p in r.json())


def test_buscar_producto_acento_en_query(client, admin_token):
    client.post("/api/productos/", json={"nombre": "Filtro aceite motor", "precio_venta": "25.00"}, headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/productos/buscar?q=aceité", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert any(p["nombre"] == "Filtro aceite motor" for p in r.json())


# Bulk price update endpoint -------------------------------------------------


def _crear_producto(client, admin_token, nombre, precio):
    r = client.post(
        "/api/productos/",
        json={"nombre": nombre, "precio_venta": precio},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_bulk_precios_actualiza_multiples(client, admin_token):
    a = _crear_producto(client, admin_token, "BulkA", "100.00")
    b = _crear_producto(client, admin_token, "BulkB", "200.00")
    r = client.patch(
        "/api/productos/bulk-precios",
        json={"items": [{"id": a, "precio_venta": "150.00"}, {"id": b, "precio_venta": "250.00"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["actualizados"] == 2
    assert set(body["ids"]) == {a, b}

    ra = client.get(f"/api/productos/{a}", headers={"Authorization": f"Bearer {admin_token}"})
    rb = client.get(f"/api/productos/{b}", headers={"Authorization": f"Bearer {admin_token}"})
    assert float(ra.json()["precio_venta"]) == 150.0
    assert float(rb.json()["precio_venta"]) == 250.0


def test_bulk_precios_atomico_falla_si_id_no_existe(client, admin_token):
    a = _crear_producto(client, admin_token, "BulkAtomico", "100.00")
    r = client.patch(
        "/api/productos/bulk-precios",
        json={"items": [{"id": a, "precio_venta": "999.00"}, {"id": 99999, "precio_venta": "10.00"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 404
    ra = client.get(f"/api/productos/{a}", headers={"Authorization": f"Bearer {admin_token}"})
    assert float(ra.json()["precio_venta"]) == 100.0


def test_bulk_precios_rechaza_precio_no_positivo(client, admin_token):
    a = _crear_producto(client, admin_token, "BulkNeg", "50.00")
    r = client.patch(
        "/api/productos/bulk-precios",
        json={"items": [{"id": a, "precio_venta": "0"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422

    r2 = client.patch(
        "/api/productos/bulk-precios",
        json={"items": [{"id": a, "precio_venta": "-10"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 422


def test_bulk_precios_rechaza_lista_vacia(client, admin_token):
    r = client.patch(
        "/api/productos/bulk-precios",
        json={"items": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_bulk_precios_rechaza_ids_duplicados(client, admin_token):
    a = _crear_producto(client, admin_token, "BulkDup", "100.00")
    r = client.patch(
        "/api/productos/bulk-precios",
        json={"items": [{"id": a, "precio_venta": "150.00"}, {"id": a, "precio_venta": "200.00"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_bulk_precios_vendedor_no_puede(client, vendedor_token, admin_token):
    a = _crear_producto(client, admin_token, "BulkVend", "100.00")
    r = client.patch(
        "/api/productos/bulk-precios",
        json={"items": [{"id": a, "precio_venta": "150.00"}]},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert r.status_code == 403


# Specs (technical specifications) tests ------------------------------------


def test_crear_producto_con_specs(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Aceite Motor", "precio_venta": "50.00", "specs": ["ISO 46", "ACEA C3", "SAE 80"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["nombre"] == "Aceite Motor"
    assert data["specs"] == ["ISO 46", "ACEA C3", "SAE 80"]


def test_crear_producto_sin_specs_por_defecto(client, admin_token):
    r = client.post(
        "/api/productos/",
        json={"nombre": "Tornillo", "precio_venta": "10.00"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["specs"] == []


def test_actualizar_producto_specs(client, admin_token):
    # Crear producto sin specs
    r = client.post(
        "/api/productos/",
        json={"nombre": "Producto Original", "precio_venta": "30.00"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    pid = r.json()["id"]

    # Actualizar con specs
    r2 = client.patch(
        f"/api/productos/{pid}",
        json={"specs": ["DIN 451", "ISO 100"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["specs"] == ["DIN 451", "ISO 100"]

    # Verificar que se guardó
    r3 = client.get(f"/api/productos/{pid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.json()["specs"] == ["DIN 451", "ISO 100"]


def test_actualizar_producto_limpiar_specs(client, admin_token):
    # Crear producto con specs
    r = client.post(
        "/api/productos/",
        json={"nombre": "Con Specs", "precio_venta": "40.00", "specs": ["ISO 46"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    pid = r.json()["id"]
    assert r.json()["specs"] == ["ISO 46"]

    # Limpiar specs
    r2 = client.patch(
        f"/api/productos/{pid}",
        json={"specs": []},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["specs"] == []


def test_specs_incluido_en_busqueda(client, admin_token):
    client.post(
        "/api/productos/",
        json={"nombre": "Hidraulico Premium", "precio_venta": "75.00", "specs": ["ISO 46", "ACEA C3"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    r = client.get("/api/productos/buscar?q=hidraulico", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    resultados = r.json()
    assert len(resultados) >= 1
    assert any(p["nombre"] == "Hidraulico Premium" for p in resultados)
    assert any(p["specs"] == ["ISO 46", "ACEA C3"] for p in resultados)
