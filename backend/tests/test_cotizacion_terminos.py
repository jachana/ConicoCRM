import pytest
from datetime import date
from decimal import Decimal


def test_parse_dias_contado():
    from app.api.cotizaciones import _parse_dias
    assert _parse_dias("Al contado") == 0
    assert _parse_dias("Contado") == 0


def test_parse_dias_numeric():
    from app.api.cotizaciones import _parse_dias
    assert _parse_dias("30 Días") == 30
    assert _parse_dias("60 días") == 60
    assert _parse_dias("90 Días") == 90


def test_parse_dias_none():
    from app.api.cotizaciones import _parse_dias
    assert _parse_dias(None) == 0
    assert _parse_dias("") == 0
    assert _parse_dias("Sin definir") == 0


def _make_empresa(db, plazo_credito="30 Días"):
    from app.models.empresa import Empresa
    from decimal import Decimal
    emp = Empresa(nombre="Test Empresa", plazo_credito=plazo_credito, linea_credito=Decimal("1000000"))
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def test_vendedor_extending_terms_sets_pendiente(client, vendedor_token, vendedor_user, db):
    emp = _make_empresa(db, plazo_credito="30 Días")
    payload = {
        "cliente_id": 1,
        "empresa_id": emp.id,
        "terminos_pago": "60 Días",
        "fecha": str(date.today()),
        "lineas": [],
    }
    resp = client.post(
        "/api/cotizaciones/",
        json=payload,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago_estado"] == "pendiente"


def test_vendedor_reducing_terms_stays_aprobado(client, vendedor_token, vendedor_user, db):
    emp = _make_empresa(db, plazo_credito="60 Días")
    payload = {
        "cliente_id": 1,
        "empresa_id": emp.id,
        "terminos_pago": "30 Días",
        "fecha": str(date.today()),
        "lineas": [],
    }
    resp = client.post(
        "/api/cotizaciones/",
        json=payload,
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["terminos_pago_estado"] == "aprobado"


def test_admin_can_approve_terminos(client, admin_token, vendedor_token, vendedor_user, db):
    emp = _make_empresa(db, plazo_credito="30 Días")
    create_resp = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": 1,
            "empresa_id": emp.id,
            "terminos_pago": "60 Días",
            "fecha": str(date.today()),
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    cot_id = create_resp.json()["id"]

    approve_resp = client.patch(
        f"/api/cotizaciones/{cot_id}",
        json={"terminos_pago_estado": "aprobado"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["terminos_pago_estado"] == "aprobado"


def test_vendedor_cannot_self_approve_terminos(client, vendedor_token, vendedor_user, db):
    emp = _make_empresa(db, plazo_credito="30 Días")
    create_resp = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": 1,
            "empresa_id": emp.id,
            "terminos_pago": "60 Días",
            "fecha": str(date.today()),
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    cot_id = create_resp.json()["id"]

    resp = client.patch(
        f"/api/cotizaciones/{cot_id}",
        json={"terminos_pago_estado": "aprobado"},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["terminos_pago_estado"] == "pendiente"


def test_pdf_blocked_for_vendedor_when_terminos_pendiente(client, vendedor_token, vendedor_user, db):
    """Vendedor cannot generate PDF when terminos_pago_estado is pendiente."""
    emp = _make_empresa(db, plazo_credito="30 Días")
    create_resp = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": 1,
            "empresa_id": emp.id,
            "terminos_pago": "60 Días",
            "fecha": str(date.today()),
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert create_resp.status_code == 201
    cot_data = create_resp.json()
    assert cot_data["terminos_pago_estado"] == "pendiente"
    cot_id = cot_data["id"]

    resp = client.get(
        f"/api/cotizaciones/{cot_id}/pdf",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_pdf_allowed_for_admin_when_terminos_pendiente(client, admin_token, admin_user, vendedor_token, vendedor_user, db):
    """Admin can generate PDF even when terminos_pago_estado is pendiente."""
    emp = _make_empresa(db, plazo_credito="30 Días")
    create_resp = client.post(
        "/api/cotizaciones/",
        json={
            "cliente_id": 1,
            "empresa_id": emp.id,
            "terminos_pago": "60 Días",
            "fecha": str(date.today()),
            "lineas": [],
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert create_resp.status_code == 201
    cot_data = create_resp.json()
    assert cot_data["terminos_pago_estado"] == "pendiente"
    cot_id = cot_data["id"]

    resp = client.get(
        f"/api/cotizaciones/{cot_id}/pdf",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code != 403
