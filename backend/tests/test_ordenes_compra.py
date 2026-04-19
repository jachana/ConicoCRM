import pytest


def _crear_proveedor(client, token, email="prov@test.cl"):
    r = client.post(
        "/api/proveedores/",
        json={"nombre": "Proveedor Test", "rut": None, "email": email},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201
    return r.json()["id"]


def _payload_orden(proveedor_id: int):
    return {
        "proveedor_id": proveedor_id,
        "fecha": "2026-04-18",
        "lineas": [
            {"orden": 1, "descripcion": "Producto A", "cantidad": 10, "valor_neto": 5000},
        ],
    }


def test_modelos_importables():
    from app.models.orden_compra import OrdenCompra, OrdenCompraLinea
    assert OrdenCompra.__tablename__ == "ordenes_compra"
    assert OrdenCompraLinea.__tablename__ == "orden_compra_lineas"


def test_listar_sin_autenticacion(client):
    r = client.get("/api/ordenes-compra/")
    assert r.status_code == 401


def test_listar_sin_permisos_vendedor(client, vendedor_token):
    r = client.get("/api/ordenes-compra/", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 403


def test_crear_orden(client, admin_token):
    pid = _crear_proveedor(client, admin_token)
    r = client.post(
        "/api/ordenes-compra/",
        json=_payload_orden(pid),
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["estado"] == "borrador"
    assert data["numero"] >= 1
    assert len(data["lineas"]) == 1
    linea = data["lineas"][0]
    assert linea["cantidad"] == 10
    assert linea["cantidad_recibida"] == 0
    assert float(linea["total_neto"]) == 50000.0


def test_numeracion_correlativa(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov2@test.cl")
    r1 = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    r2 = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r2.json()["numero"] == r1.json()["numero"] + 1


def test_listar_ordenes(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov3@test.cl")
    client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get("/api/ordenes-compra/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1


def test_obtener_orden(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov4@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    r2 = client.get(f"/api/ordenes-compra/{oid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["id"] == oid


def test_actualizar_orden_borrador(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov5@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    r2 = client.patch(
        f"/api/ordenes-compra/{oid}",
        json={"nota": "Urgente"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["nota"] == "Urgente"


def test_eliminar_orden_borrador(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov6@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    r2 = client.delete(f"/api/ordenes-compra/{oid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/api/ordenes-compra/{oid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r3.status_code == 404


def test_cancelar_orden_borrador(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov7@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    r2 = client.patch(
        f"/api/ordenes-compra/{oid}/estado",
        json={"estado": "cancelada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["estado"] == "cancelada"


def test_cancelar_orden_enviada(client, admin_token):
    from tests.conftest import TestingSession
    from app.models.orden_compra import OrdenCompra

    pid = _crear_proveedor(client, admin_token, email="prov7b@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]

    db = TestingSession()
    orden = db.get(OrdenCompra, oid)
    orden.estado = "enviada"
    db.commit()
    db.close()

    r2 = client.patch(
        f"/api/ordenes-compra/{oid}/estado",
        json={"estado": "cancelada"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["estado"] == "cancelada"


def test_no_puede_eliminar_orden_no_borrador(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov8@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    client.patch(f"/api/ordenes-compra/{oid}/estado", json={"estado": "cancelada"}, headers={"Authorization": f"Bearer {admin_token}"})
    r2 = client.delete(f"/api/ordenes-compra/{oid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 400


def test_recepcionar_parcial(client, admin_token):
    from app.models.producto import Producto
    from tests.conftest import TestingSession
    from app.models.orden_compra import OrdenCompra

    pid = _crear_proveedor(client, admin_token, email="prov9@test.cl")

    db = TestingSession()
    producto = Producto(nombre="Prod Test", stock_actual=0, stock_minimo=0, precio_costo=0, precio_venta=0)
    db.add(producto)
    db.commit()
    db.refresh(producto)
    prod_id = producto.id
    db.close()

    payload = {
        "proveedor_id": pid,
        "fecha": "2026-04-18",
        "lineas": [
            {"orden": 1, "descripcion": "Prod Test", "cantidad": 10, "valor_neto": 1000, "producto_id": prod_id},
        ],
    }
    r = client.post("/api/ordenes-compra/", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    linea_id = r.json()["lineas"][0]["id"]

    db = TestingSession()
    orden = db.get(OrdenCompra, oid)
    orden.estado = "enviada"
    db.commit()
    db.close()

    r2 = client.post(
        f"/api/ordenes-compra/{oid}/recepcionar",
        json={"lineas": [{"id": linea_id, "cantidad_recibida": 6}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["estado"] == "recibida_parcial"
    assert data["lineas"][0]["cantidad_recibida"] == 6

    db = TestingSession()
    prod = db.get(Producto, prod_id)
    assert prod.stock_actual == 6
    db.close()


def test_recepcionar_completa(client, admin_token):
    from tests.conftest import TestingSession
    from app.models.orden_compra import OrdenCompra

    pid = _crear_proveedor(client, admin_token, email="prov10@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    linea_id = r.json()["lineas"][0]["id"]

    db = TestingSession()
    orden = db.get(OrdenCompra, oid)
    orden.estado = "enviada"
    db.commit()
    db.close()

    r2 = client.post(
        f"/api/ordenes-compra/{oid}/recepcionar",
        json={"lineas": [{"id": linea_id, "cantidad_recibida": 10}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200
    assert r2.json()["estado"] == "recibida_completa"


def test_recepcionar_estado_invalido(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov10b@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    linea_id = r.json()["lineas"][0]["id"]

    r2 = client.post(
        f"/api/ordenes-compra/{oid}/recepcionar",
        json={"lineas": [{"id": linea_id, "cantidad_recibida": 5}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 400


def test_exportar_excel(client, admin_token):
    r = client.get("/api/ordenes-compra/export/excel", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]


def test_generar_pdf(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov11@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    r2 = client.get(f"/api/ordenes-compra/{oid}/pdf", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200


def test_subadmin_puede_crear(client, subadmin_token):
    r = client.post(
        "/api/proveedores/",
        json={"nombre": "Prov Sub"},
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert r.status_code == 201
    pid = r.json()["id"]
    r2 = client.post(
        "/api/ordenes-compra/",
        json=_payload_orden(pid),
        headers={"Authorization": f"Bearer {subadmin_token}"},
    )
    assert r2.status_code == 201


def test_filtrar_por_proveedor(client, admin_token):
    pid1 = _crear_proveedor(client, admin_token, email="prov12@test.cl")
    pid2_r = client.post("/api/proveedores/", json={"nombre": "Otro"}, headers={"Authorization": f"Bearer {admin_token}"})
    pid2 = pid2_r.json()["id"]
    client.post("/api/ordenes-compra/", json=_payload_orden(pid1), headers={"Authorization": f"Bearer {admin_token}"})
    client.post("/api/ordenes-compra/", json=_payload_orden(pid2), headers={"Authorization": f"Bearer {admin_token}"})
    r = client.get(f"/api/ordenes-compra/?proveedor_id={pid1}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert all(o["proveedor_id"] == pid1 for o in r.json())


def test_no_puede_editar_orden_no_borrador(client, admin_token):
    pid = _crear_proveedor(client, admin_token, email="prov13@test.cl")
    r = client.post("/api/ordenes-compra/", json=_payload_orden(pid), headers={"Authorization": f"Bearer {admin_token}"})
    oid = r.json()["id"]
    client.patch(f"/api/ordenes-compra/{oid}/estado", json={"estado": "cancelada"}, headers={"Authorization": f"Bearer {admin_token}"})
    r2 = client.patch(f"/api/ordenes-compra/{oid}", json={"nota": "test"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 400
