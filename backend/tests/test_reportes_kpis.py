"""Tests for GET /api/reportes/kpis endpoint."""

from datetime import date, timedelta, datetime, timezone
from decimal import Decimal


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fixtures(db):
    """Create minimal fixtures: empresa, cliente, user, facturas, boletas, dte_emision."""
    from app.models.empresa import Empresa
    from app.models.user import User
    from app.models.cliente import Cliente
    from app.models.factura import Factura
    from app.models.boleta import Boleta
    from app.models.dte_emision import DteEmision
    from app.core.modulos import OPTIONAL_MODULES

    empresa = Empresa(nombre="Test Empresa KPI", modulos_enabled={s: True for s in OPTIONAL_MODULES})
    db.add(empresa)
    db.flush()

    cliente = Cliente(nombre="Cliente KPI Test", empresa_id=empresa.id)
    db.add(cliente)
    db.flush()

    periodo_date = date(2026, 5, 15)
    past_venc = date(2026, 4, 1)  # already overdue

    fac = Factura(
        numero=90001,
        cliente_id=cliente.id,
        fecha=periodo_date,
        estado="emitida",
        total=Decimal("1000000"),
        total_neto=Decimal("840336"),
        total_iva=Decimal("159664"),
        fecha_vencimiento=past_venc,
    )
    db.add(fac)

    fac2 = Factura(
        numero=90002,
        cliente_id=cliente.id,
        fecha=periodo_date,
        estado="emitida",
        total=Decimal("500000"),
        total_neto=Decimal("420168"),
        total_iva=Decimal("79832"),
    )
    db.add(fac2)

    bol = Boleta(
        numero=80001,
        fecha=periodo_date,
        tipo_dte="39",
        estado="emitida",
        total=Decimal("200000"),
        total_neto=Decimal("168067"),
        total_iva=Decimal("31933"),
    )
    db.add(bol)
    db.flush()

    dte = DteEmision(
        tipo="033",
        folio=90001,
        estado="aceptada",
        factura_id=fac.id,
        monto_neto=840336,
        monto_iva=159664,
        monto_total=1000000,
        created_at=datetime(2026, 5, 15, 12, 0, 0, tzinfo=timezone.utc),
    )
    db.add(dte)
    dte2 = DteEmision(
        tipo="033",
        folio=90002,
        estado="rechazada",
        factura_id=fac2.id,
        monto_neto=420168,
        monto_iva=79832,
        monto_total=500000,
        created_at=datetime(2026, 5, 16, 10, 0, 0, tzinfo=timezone.utc),
    )
    db.add(dte2)
    db.commit()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_kpis_returns_valid_structure(client, admin_token, db):
    _make_fixtures(db)
    r = client.get(
        "/api/reportes/kpis",
        params={"periodo": "2026-05"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["periodo"] == "2026-05"

    # ventas section
    assert "ventas" in data
    v = data["ventas"]
    assert "total" in v
    assert "total_anterior" in v
    assert "delta_pct" in v
    assert "count" in v
    assert "sparkline" in v
    assert isinstance(v["total"], float)
    assert isinstance(v["delta_pct"], float)
    assert isinstance(v["count"], int)
    assert isinstance(v["sparkline"], list)

    # top_clientes
    assert "top_clientes" in data
    assert isinstance(data["top_clientes"], list)
    if data["top_clientes"]:
        c = data["top_clientes"][0]
        assert "nombre" in c
        assert "total" in c
        assert "count" in c

    # dte_rejection
    assert "dte_rejection" in data
    dte = data["dte_rejection"]
    assert "rate" in dte
    assert "rechazadas" in dte
    assert "emitidas" in dte
    assert isinstance(dte["rate"], float)
    assert isinstance(dte["rechazadas"], int)
    assert isinstance(dte["emitidas"], int)

    # ar_aging
    assert "ar_aging" in data
    aging = data["ar_aging"]
    for bucket in ("d_0_30", "d_31_60", "d_61_90", "d_90_plus"):
        assert bucket in aging, f"Missing bucket {bucket}"
        assert "count" in aging[bucket]
        assert "monto" in aging[bucket]


def test_kpis_ventas_includes_boletas(client, admin_token, db):
    _make_fixtures(db)
    r = client.get(
        "/api/reportes/kpis",
        params={"periodo": "2026-05"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    # total should include facturas (1500000) + boleta (200000) = 1700000
    assert data["ventas"]["total"] == 1700000.0
    assert data["ventas"]["count"] == 3  # 2 facturas + 1 boleta


def test_kpis_dte_rejection_rate(client, admin_token, db):
    _make_fixtures(db)
    r = client.get(
        "/api/reportes/kpis",
        params={"periodo": "2026-05"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    dte = r.json()["dte_rejection"]
    assert dte["emitidas"] == 2
    assert dte["rechazadas"] == 1
    assert dte["rate"] == 50.0


def test_kpis_default_periodo(client, admin_token):
    """Omitting periodo should default to current month without error."""
    r = client.get(
        "/api/reportes/kpis",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "periodo" in data
    assert "ventas" in data


def test_kpis_invalid_periodo_format(client, admin_token):
    r = client.get(
        "/api/reportes/kpis",
        params={"periodo": "not-a-date"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_kpis_invalid_month(client, admin_token):
    r = client.get(
        "/api/reportes/kpis",
        params={"periodo": "2026-13"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422


def test_kpis_december_wraps_year(client, admin_token):
    """periodo=2026-12 should not crash (month+1 edge case)."""
    r = client.get(
        "/api/reportes/kpis",
        params={"periodo": "2026-12"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["periodo"] == "2026-12"


def test_kpis_requires_auth(client):
    r = client.get("/api/reportes/kpis", params={"periodo": "2026-05"})
    assert r.status_code == 401


def test_kpis_empty_period_returns_zeros(client, admin_token):
    """Period with no data returns zeros / empty lists."""
    r = client.get(
        "/api/reportes/kpis",
        params={"periodo": "2000-01"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ventas"]["total"] == 0.0
    assert data["ventas"]["count"] == 0
    assert data["ventas"]["delta_pct"] == 0.0
    assert data["ventas"]["sparkline"] == []
    assert data["top_clientes"] == []
    assert data["dte_rejection"]["emitidas"] == 0
    assert data["dte_rejection"]["rate"] == 0.0
