from datetime import date, timedelta
from decimal import Decimal
import pytest
from unittest.mock import patch
from app.models.empresa import Empresa
from app.models.factura import Factura


@pytest.fixture
def empresa_con_factura_vencida(db):
    emp = Empresa(nombre="Deudor S.A.", rut="22222222-2", email="contacto@deudor.cl")
    db.add(emp)
    db.flush()

    fac = Factura(
        numero=9001,
        fecha=date.today() - timedelta(days=30),
        fecha_vencimiento=date.today() - timedelta(days=1),
        estado="emitida",
        total_neto=Decimal("100000"),
        total_iva=Decimal("19000"),
        total=Decimal("119000"),
        monto_pagado=Decimal("0"),
        empresa_id=emp.id,
        origen="xml",
    )
    db.add(fac)
    db.commit()
    return emp.id


def test_dashboard_structure(client, admin_token, empresa_con_factura_vencida):
    resp = client.get("/api/cobranza/dashboard", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "total_por_cobrar" in data
    assert "total_vencido" in data
    assert "proximas_a_vencer" in data
    assert "aging" in data
    assert "d_0_30" in data["aging"]
    assert "por_empresa" in data


def test_dashboard_counts_pending_factura(client, admin_token, empresa_con_factura_vencida):
    resp = client.get("/api/cobranza/dashboard", headers={"Authorization": f"Bearer {admin_token}"})
    data = resp.json()
    assert Decimal(str(data["total_por_cobrar"])) >= Decimal("119000")
    assert Decimal(str(data["total_vencido"])) >= Decimal("119000")


def test_recordatorios_lists_overdue(client, admin_token, empresa_con_factura_vencida):
    resp = client.get("/api/cobranza/recordatorios", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    item = next((i for i in data if i["numero"] == 9001), None)
    assert item is not None
    assert item["dias_vencida"] >= 1
    assert Decimal(str(item["saldo"])) > 0
    assert item["correo_enviar"] == "contacto@deudor.cl"


def test_recordatorio_not_shown_if_recently_sent(client, admin_token, db, empresa_con_factura_vencida):
    from app.models.factura import Factura
    fac = db.query(Factura).filter(Factura.numero == 9001).first()
    fac.ultimo_recordatorio = date.today()
    db.commit()

    resp = client.get("/api/cobranza/recordatorios", headers={"Authorization": f"Bearer {admin_token}"})
    data = resp.json()
    nums = [i["numero"] for i in data]
    assert 9001 not in nums


def test_config_get_creates_default(client, admin_token, empresa_con_factura_vencida):
    resp = client.get(
        f"/api/cobranza/config/{empresa_con_factura_vencida}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["dias_frecuencia"] == 7
    assert data["empresa_id"] == empresa_con_factura_vencida


def test_config_update(client, admin_token, empresa_con_factura_vencida):
    client.get(f"/api/cobranza/config/{empresa_con_factura_vencida}", headers={"Authorization": f"Bearer {admin_token}"})
    resp = client.put(
        f"/api/cobranza/config/{empresa_con_factura_vencida}",
        json={"dias_frecuencia": 14},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["dias_frecuencia"] == 14


def test_enviar_recordatorio_stamps_ultimo_recordatorio(client, admin_token, db, empresa_con_factura_vencida):
    from app.models.factura import Factura
    fac = db.query(Factura).filter(Factura.numero == 9001).first()

    with patch("app.api.facturas._send_recordatorio") as mock_send:
        resp = client.post(
            f"/api/facturas/{fac.id}/recordatorio",
            json={
                "to": "test@test.com",
                "subject": "Recordatorio",
                "body": "Hola",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    assert resp.status_code == 200
    mock_send.assert_called_once_with(to="test@test.com", subject="Recordatorio", body="Hola")
    db.refresh(fac)
    from datetime import date
    assert fac.ultimo_recordatorio == date.today()
