"""Tests for vendor-initiated discount approval workflow."""
from datetime import date
from decimal import Decimal


def _make_cotizacion(db, vendedor_id: int, descuento: Decimal = Decimal("0")) -> tuple[int, int]:
    from app.models.cotizacion import Cotizacion, CotizacionLinea
    cot = Cotizacion(
        numero=9101,
        cliente_id=1,
        vendedor_id=vendedor_id,
        fecha=date(2026, 4, 30),
        estado="abierta",
        total_neto=Decimal("100000"),
        total_iva=Decimal("19000"),
        total=Decimal("119000"),
    )
    db.add(cot)
    db.flush()
    linea = CotizacionLinea(
        cotizacion_id=cot.id,
        orden=1,
        descripcion="Aceite",
        cantidad=1,
        valor_neto=Decimal("100000"),
        descuento=descuento,
        total_neto=Decimal("100000"),
        iva=Decimal("19000"),
        total=Decimal("119000"),
    )
    db.add(linea)
    db.commit()
    db.refresh(cot)
    return cot.id, linea.id


def _payload(cot_id: int, linea_id: int, propuesto: float = 15.0):
    return {
        "cotizacion_id": cot_id,
        "nota": "Cliente clave",
        "lineas_propuestas": [
            {
                "linea_id": linea_id,
                "descripcion": "Aceite",
                "descuento_actual": 0.0,
                "descuento_propuesto": propuesto,
            }
        ],
    }


def _seed_umbral(db, pct: str = "5"):
    from app.models.system_config import SystemConfig
    cfg = db.get(SystemConfig, "descuento_umbral_libre_pct")
    if cfg:
        cfg.value = pct
    else:
        db.add(SystemConfig(key="descuento_umbral_libre_pct", value=pct))
    db.commit()


def test_vendor_can_create_solicitud(client, vendedor_token, vendedor_user, db):
    _seed_umbral(db)
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    resp = client.post(
        "/api/solicitudes-descuento/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["estado"] == "pendiente"
    assert data["cotizacion_id"] == cot_id
    assert len(data["lineas_propuestas"]) == 1
    assert data["lineas_propuestas"][0]["descuento_propuesto"] == 15.0


def test_create_solicitud_notifies_admin(client, vendedor_token, vendedor_user, admin_user, db):
    _seed_umbral(db)
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    resp = client.post(
        "/api/solicitudes-descuento/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
    from app.models.notification import Notification
    notifs = db.query(Notification).filter(Notification.user_id == admin_user.id).all()
    assert len(notifs) == 1
    assert notifs[0].tipo == "aprobacion_pendiente"
    assert notifs[0].payload.get("solicitud_descuento_id") == resp.json()["id"]


def test_admin_aprobar_applies_descuento_and_notifies_vendor(
    client, admin_token, vendedor_user, db
):
    _seed_umbral(db)
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    # Vendor creates solicitud directly via DB to skip auth flow
    from app.models.solicitud_descuento import SolicitudDescuento
    import json as _json
    s = SolicitudDescuento(
        cotizacion_id=cot_id,
        vendedor_id=vendedor_user.id,
        estado="pendiente",
        lineas_propuestas=_json.dumps([
            {
                "linea_id": linea_id,
                "descripcion": "Aceite",
                "descuento_actual": 0.0,
                "descuento_propuesto": 15.0,
            }
        ]),
    )
    db.add(s)
    db.commit()
    db.refresh(s)

    resp = client.patch(
        f"/api/solicitudes-descuento/{s.id}",
        json={"accion": "aprobar", "comentario": "Ok cliente clave"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["estado"] == "aprobada"
    assert resp.json()["comentario_revisor"] == "Ok cliente clave"

    from app.models.cotizacion import CotizacionLinea
    db.expire_all()
    linea = db.get(CotizacionLinea, linea_id)
    assert linea.descuento == Decimal("15")
    # 100000 * (1 - 0.15) = 85000
    assert linea.total_neto == Decimal("85000.00")

    from app.models.notification import Notification
    vend_notifs = db.query(Notification).filter(
        Notification.user_id == vendedor_user.id,
        Notification.tipo == "aprobacion_resuelta",
    ).all()
    assert len(vend_notifs) == 1
    assert vend_notifs[0].payload.get("estado") == "aprobada"


def test_admin_rechazar(client, admin_token, vendedor_user, db):
    _seed_umbral(db)
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    from app.models.solicitud_descuento import SolicitudDescuento
    import json as _json
    s = SolicitudDescuento(
        cotizacion_id=cot_id,
        vendedor_id=vendedor_user.id,
        estado="pendiente",
        lineas_propuestas=_json.dumps([
            {"linea_id": linea_id, "descripcion": "Aceite",
             "descuento_actual": 0.0, "descuento_propuesto": 20.0},
        ]),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    resp = client.patch(
        f"/api/solicitudes-descuento/{s.id}",
        json={"accion": "rechazar", "comentario": "Margen muy bajo"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["estado"] == "rechazada"
    assert resp.json()["comentario_revisor"] == "Margen muy bajo"
    # Línea sin tocar
    from app.models.cotizacion import CotizacionLinea
    db.expire_all()
    assert db.get(CotizacionLinea, linea_id).descuento == Decimal("0")


def test_vendor_cannot_aprobar(client, vendedor_token, vendedor_user, db):
    _seed_umbral(db)
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    from app.models.solicitud_descuento import SolicitudDescuento
    import json as _json
    s = SolicitudDescuento(
        cotizacion_id=cot_id,
        vendedor_id=vendedor_user.id,
        estado="pendiente",
        lineas_propuestas=_json.dumps([{"linea_id": linea_id, "descripcion": "x",
                                         "descuento_actual": 0.0, "descuento_propuesto": 15.0}]),
    )
    db.add(s); db.commit(); db.refresh(s)
    resp = client.patch(
        f"/api/solicitudes-descuento/{s.id}",
        json={"accion": "aprobar"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_vendor_can_revocar_own_pendiente(client, vendedor_token, vendedor_user, db):
    _seed_umbral(db)
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    from app.models.solicitud_descuento import SolicitudDescuento
    import json as _json
    s = SolicitudDescuento(
        cotizacion_id=cot_id,
        vendedor_id=vendedor_user.id,
        estado="pendiente",
        lineas_propuestas=_json.dumps([{"linea_id": linea_id, "descripcion": "x",
                                         "descuento_actual": 0.0, "descuento_propuesto": 15.0}]),
    )
    db.add(s); db.commit(); db.refresh(s)
    resp = client.patch(
        f"/api/solicitudes-descuento/{s.id}",
        json={"accion": "revocar"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["estado"] == "revocada"


def test_latest_wins_replaces_pending(client, vendedor_token, vendedor_user, db):
    _seed_umbral(db)
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    headers = {"Authorization": f"Bearer {vendedor_token}"}
    r1 = client.post("/api/solicitudes-descuento/", json=_payload(cot_id, linea_id, 10.0), headers=headers)
    first_id = r1.json()["id"]
    r2 = client.post("/api/solicitudes-descuento/", json=_payload(cot_id, linea_id, 15.0), headers=headers)
    assert r2.status_code == 201
    check = client.get(f"/api/solicitudes-descuento/{first_id}", headers=headers)
    assert check.json()["estado"] == "rechazada"


def test_status_blocked_when_descuento_above_umbral_and_no_aprobada(
    client, vendedor_token, vendedor_user, db
):
    _seed_umbral(db, pct="5")
    cot_id, _ = _make_cotizacion(db, vendedor_user.id, descuento=Decimal("15"))
    resp = client.get(
        f"/api/solicitudes-descuento/status/{cot_id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["blocked"] is True
    assert body["umbral_libre_pct"] == 5.0


def test_status_unblocked_when_descuento_within_umbral(
    client, vendedor_token, vendedor_user, db
):
    _seed_umbral(db, pct="10")
    cot_id, _ = _make_cotizacion(db, vendedor_user.id, descuento=Decimal("5"))
    resp = client.get(
        f"/api/solicitudes-descuento/status/{cot_id}",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.json()["blocked"] is False


def test_status_unblocked_after_aprobada(client, admin_token, vendedor_user, db):
    _seed_umbral(db, pct="5")
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id, descuento=Decimal("15"))
    from app.models.solicitud_descuento import SolicitudDescuento
    import json as _json
    s = SolicitudDescuento(
        cotizacion_id=cot_id,
        vendedor_id=vendedor_user.id,
        estado="pendiente",
        lineas_propuestas=_json.dumps([{"linea_id": linea_id, "descripcion": "x",
                                         "descuento_actual": 0.0, "descuento_propuesto": 15.0}]),
    )
    db.add(s); db.commit(); db.refresh(s)
    client.patch(
        f"/api/solicitudes-descuento/{s.id}",
        json={"accion": "aprobar"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = client.get(
        f"/api/solicitudes-descuento/status/{cot_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.json()["blocked"] is False


def test_vendor_cannot_save_cotizacion_with_descuento_above_umbral(
    client, vendedor_token, vendedor_user, db, cliente_demo
):
    _seed_umbral(db, pct="5")
    payload = {
        "cliente_id": cliente_demo.id,
        "fecha": "2026-04-30",
        "estado": "no_definido",
        "lineas": [
            {
                "orden": 1,
                "producto_id": None,
                "sku": "SKU-1",
                "descripcion": "Aceite",
                "cantidad": 1,
                "valor_neto": "100000",
                "descuento": "15",
            }
        ],
    }
    # Need a producto so _check_lineas_invalidas does not 422 on linea_sin_item
    from app.models.producto import Producto
    p = Producto(sku="SKU-1", nombre="Aceite", precio_venta=Decimal("100000"), precio_costo=Decimal("50000"))
    db.add(p); db.commit(); db.refresh(p)
    payload["lineas"][0]["producto_id"] = p.id

    resp = client.post(
        "/api/cotizaciones/",
        json=payload,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 422
    assert "descuento_supera_umbral" in resp.json()["detail"]


def test_admin_can_save_cotizacion_with_descuento_above_umbral(
    client, admin_token, db, cliente_demo
):
    _seed_umbral(db, pct="5")
    from app.models.producto import Producto
    p = Producto(sku="SKU-2", nombre="Aceite", precio_venta=Decimal("100000"), precio_costo=Decimal("50000"))
    db.add(p); db.commit(); db.refresh(p)
    payload = {
        "cliente_id": cliente_demo.id,
        "fecha": "2026-04-30",
        "estado": "no_definido",
        "lineas": [
            {
                "orden": 1,
                "producto_id": p.id,
                "sku": "SKU-2",
                "descripcion": "Aceite",
                "cantidad": 1,
                "valor_neto": "100000",
                "descuento": "20",
            }
        ],
    }
    resp = client.post(
        "/api/cotizaciones/",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201, resp.text


def test_listar_filters_for_vendor(client, vendedor_token, vendedor_user, admin_user, db):
    _seed_umbral(db)
    from app.models.solicitud_descuento import SolicitudDescuento
    cot_id, linea_id = _make_cotizacion(db, vendedor_user.id)
    import json as _json
    own = SolicitudDescuento(
        cotizacion_id=cot_id, vendedor_id=vendedor_user.id, estado="pendiente",
        lineas_propuestas=_json.dumps([{"linea_id": linea_id, "descripcion": "x",
                                         "descuento_actual": 0.0, "descuento_propuesto": 10.0}]),
    )
    other = SolicitudDescuento(
        cotizacion_id=cot_id, vendedor_id=admin_user.id, estado="pendiente",
        lineas_propuestas=_json.dumps([{"linea_id": linea_id, "descripcion": "x",
                                         "descuento_actual": 0.0, "descuento_propuesto": 10.0}]),
    )
    db.add_all([own, other]); db.commit()
    resp = client.get(
        "/api/solicitudes-descuento/",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["vendedor_id"] == vendedor_user.id
