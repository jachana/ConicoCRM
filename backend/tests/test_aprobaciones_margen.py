import pytest
from datetime import date
from decimal import Decimal


def _make_cotizacion_direct(db, vendedor_id: int) -> tuple[int, int]:
    """Create a cotizacion directly in DB for tests."""
    from app.models.cotizacion import Cotizacion, CotizacionLinea
    cot = Cotizacion(
        numero=9001,
        cliente_id=1,  # SQLite won't enforce this FK
        vendedor_id=vendedor_id,
        fecha=date(2026, 4, 20),
        estado="abierta",
        total_neto=Decimal("45000"),
        total_iva=Decimal("8550"),
        total=Decimal("53550"),
    )
    db.add(cot)
    db.flush()
    linea = CotizacionLinea(
        cotizacion_id=cot.id,
        orden=1,
        descripcion="Aceite Motor",
        cantidad=1,
        valor_neto=Decimal("45000"),
        total_neto=Decimal("45000"),
        iva=Decimal("8550"),
        total=Decimal("53550"),
        margen=Decimal("0.02"),
    )
    db.add(linea)
    db.commit()
    db.refresh(cot)
    return cot.id, linea.id


def _payload(cotizacion_id: int, linea_id: int):
    return {
        "cotizacion_id": cotizacion_id,
        "nota": "cliente muy importante",
        "lineas_propuestas": [
            {
                "linea_id": linea_id,
                "descripcion": "Aceite Motor",
                "valor_neto_actual": 45000,
                "margen_actual": 0.02,
                "valor_neto_propuesto": 40000,
                "margen_propuesto": 0.10,
            }
        ],
    }


def test_vendor_can_create_solicitud(client, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion_direct(db, vendedor_user.id)
    resp = client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["estado"] == "pendiente"
    assert data["cotizacion_id"] == cot_id
    assert len(data["lineas_propuestas"]) == 1


def test_latest_wins_auto_denies_previous(client, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion_direct(db, vendedor_user.id)
    headers = {"Authorization": f"Bearer {vendedor_token}"}
    resp1 = client.post("/api/aprobaciones_margen/", json=_payload(cot_id, linea_id), headers=headers)
    first_id = resp1.json()["id"]
    resp2 = client.post("/api/aprobaciones_margen/", json=_payload(cot_id, linea_id), headers=headers)
    assert resp2.status_code == 201
    # First request should be auto-denied
    check = client.get(f"/api/aprobaciones_margen/{first_id}", headers=headers)
    assert check.json()["estado"] == "denegada"


def test_admin_can_deny(client, admin_token, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion_direct(db, vendedor_user.id)
    create = client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    apro_id = create.json()["id"]
    resp = client.patch(
        f"/api/aprobaciones_margen/{apro_id}",
        json={"accion": "denegar"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["estado"] == "denegada"


def test_admin_can_approve_and_lineas_update(client, admin_token, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion_direct(db, vendedor_user.id)
    create = client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    apro_id = create.json()["id"]
    resp = client.patch(
        f"/api/aprobaciones_margen/{apro_id}",
        json={"accion": "aprobar"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["estado"] == "aprobada"
    # Cotizacion linea should have updated valor_neto
    from app.models.cotizacion import CotizacionLinea
    linea = db.get(CotizacionLinea, linea_id)
    db.refresh(linea)
    assert linea.valor_neto == Decimal("40000")


def test_vendor_cannot_approve(client, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion_direct(db, vendedor_user.id)
    create = client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    apro_id = create.json()["id"]
    resp = client.patch(
        f"/api/aprobaciones_margen/{apro_id}",
        json={"accion": "aprobar"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_cotizacion_id_filter(client, admin_token, vendedor_token, vendedor_user, db):
    cot_id, linea_id = _make_cotizacion_direct(db, vendedor_user.id)
    client.post(
        "/api/aprobaciones_margen/",
        json=_payload(cot_id, linea_id),
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    resp = client.get(
        f"/api/aprobaciones_margen/?cotizacion_id={cot_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["cotizacion_id"] == cot_id
