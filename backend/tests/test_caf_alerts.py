"""
Tests for GET /api/cafs/alerts/ endpoint.

Covers:
- Low-stock detection (consumido/total >= 0.9)
- Expiring-soon detection (days to expiry < 30)
- vigente=False CAFs excluded
- No empresa_id returns empty
- Sorting: ambos → vencimiento → stock; within urgency by dias_al_vencimiento asc, nulls last
- Unauthenticated request returns 401
"""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.caf import CAF
from app.models.empresa import Empresa
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_empresa(db, rut="76.000.000-1", nombre="Test Empresa"):
    empresa = Empresa(rut=rut, nombre=nombre)
    db.add(empresa)
    db.flush()
    return empresa


def _make_user(db, empresa_id, role="vendedor", email="user@caf.cl", _hash="dummy_hash"):
    user = User(
        email=email,
        name="Test User",
        hashed_password=_hash,
        role=role,
        is_active=True,
        empresa_id=empresa_id,
    )
    db.add(user)
    db.flush()
    return user


def _make_caf(
    db,
    empresa_id: int,
    tipo_dte: str = "33",
    num_inicio: int = 1,
    num_fin: int = 100,
    consumido: int = 0,
    vigente: bool = True,
    fecha_vencimiento=None,
) -> CAF:
    caf = CAF(
        empresa_id=empresa_id,
        tipo_dte=tipo_dte,
        num_inicio=num_inicio,
        num_fin=num_fin,
        archivo_xml="<dummy/>",
        vigente=vigente,
        consumido=consumido,
        fecha_vencimiento=fecha_vencimiento,
    )
    db.add(caf)
    db.flush()
    return caf


# ---------------------------------------------------------------------------
# Unit tests for CAF model helpers (no HTTP needed)
# ---------------------------------------------------------------------------

class TestCAFModelAlertMethods:
    def test_is_low_stock_true(self, db):
        empresa = _make_empresa(db)
        caf = _make_caf(db, empresa.id, consumido=95, num_inicio=1, num_fin=100)
        db.commit()
        assert caf.is_low_stock() is True

    def test_is_low_stock_exactly_90_percent(self, db):
        empresa = _make_empresa(db)
        caf = _make_caf(db, empresa.id, consumido=90, num_inicio=1, num_fin=100)
        db.commit()
        assert caf.is_low_stock() is True

    def test_is_low_stock_false_below_threshold(self, db):
        empresa = _make_empresa(db)
        caf = _make_caf(db, empresa.id, consumido=89, num_inicio=1, num_fin=100)
        db.commit()
        assert caf.is_low_stock() is False

    def test_is_expiring_soon_yesterday(self, db):
        """fecha_vencimiento in the past → days < 30 → True"""
        empresa = _make_empresa(db)
        yesterday = date.today() - timedelta(days=1)
        caf = _make_caf(db, empresa.id, fecha_vencimiento=yesterday)
        db.commit()
        assert caf.is_expiring_soon() is True

    def test_is_expiring_soon_29_days(self, db):
        empresa = _make_empresa(db)
        soon = date.today() + timedelta(days=29)
        caf = _make_caf(db, empresa.id, fecha_vencimiento=soon)
        db.commit()
        assert caf.is_expiring_soon() is True

    def test_is_expiring_soon_exactly_30_days_is_false(self, db):
        """days == 30 → NOT expiring soon (boundary is strictly < 30)"""
        empresa = _make_empresa(db)
        boundary = date.today() + timedelta(days=30)
        caf = _make_caf(db, empresa.id, fecha_vencimiento=boundary)
        db.commit()
        assert caf.is_expiring_soon() is False

    def test_is_expiring_soon_no_fecha(self, db):
        empresa = _make_empresa(db)
        caf = _make_caf(db, empresa.id)
        db.commit()
        assert caf.is_expiring_soon() is False


# ---------------------------------------------------------------------------
# HTTP endpoint tests
# ---------------------------------------------------------------------------

@pytest.fixture
def _client_and_user(db, _test_password_hash):
    """Return (TestClient, empresa, user, auth_headers) with DB override."""
    from app.database import get_db
    from app.api.auth import get_current_user

    empresa = _make_empresa(db, rut="76.111.111-1")
    user = _make_user(db, empresa.id, _hash=_test_password_hash, email="caf_user@test.cl")
    db.commit()
    db.refresh(user)

    captured_user = user

    def _override_get_user():
        return captured_user

    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _override_get_user

    with TestClient(app) as c:
        yield c, empresa, user

    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


class TestCAFAlertsEndpoint:
    def test_unauthenticated_returns_401(self, client):
        r = client.get("/api/cafs/alerts/")
        assert r.status_code == 401

    def test_no_alerts_returns_empty(self, _client_and_user, db):
        """No CAFs in alert state → empty list."""
        c, empresa, user = _client_and_user
        # A CAF with 0% consumption, no expiry
        _make_caf(db, empresa.id, consumido=0)
        db.commit()

        r = c.get("/api/cafs/alerts/")
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 0
        assert data["alerts"] == []

    def test_low_stock_caf_appears_in_alerts(self, _client_and_user, db):
        c, empresa, user = _client_and_user
        _make_caf(db, empresa.id, consumido=95, num_inicio=1, num_fin=100)
        db.commit()

        r = c.get("/api/cafs/alerts/")
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 1
        alert = data["alerts"][0]
        assert alert["is_low_stock"] is True
        assert alert["urgencia"] == "stock"
        assert alert["folios_restantes"] == 5
        assert alert["total_folios"] == 100
        assert alert["porcentaje_consumido"] == 95.0

    def test_expiring_soon_caf_appears_in_alerts(self, _client_and_user, db):
        c, empresa, user = _client_and_user
        soon = date.today() + timedelta(days=10)
        _make_caf(db, empresa.id, consumido=0, fecha_vencimiento=soon)
        db.commit()

        r = c.get("/api/cafs/alerts/")
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 1
        alert = data["alerts"][0]
        assert alert["is_expiring_soon"] is True
        assert alert["urgencia"] == "vencimiento"
        assert alert["dias_al_vencimiento"] == 10

    def test_vigente_false_excluded(self, _client_and_user, db):
        c, empresa, user = _client_and_user
        # Low stock but not vigente → should NOT appear
        _make_caf(db, empresa.id, consumido=95, vigente=False)
        db.commit()

        r = c.get("/api/cafs/alerts/")
        assert r.status_code == 200
        assert r.json()["count"] == 0

    def test_ambos_urgencia_when_both_conditions(self, _client_and_user, db):
        c, empresa, user = _client_and_user
        soon = date.today() + timedelta(days=5)
        _make_caf(db, empresa.id, consumido=95, fecha_vencimiento=soon)
        db.commit()

        r = c.get("/api/cafs/alerts/")
        assert r.status_code == 200
        alert = r.json()["alerts"][0]
        assert alert["urgencia"] == "ambos"
        assert alert["is_low_stock"] is True
        assert alert["is_expiring_soon"] is True

    def test_sorting_ambos_before_vencimiento_before_stock(self, _client_and_user, db):
        """ambos → vencimiento → stock ordering."""
        c, empresa, user = _client_and_user

        soon = date.today() + timedelta(days=5)
        # stock-only CAF (tipo 34)
        _make_caf(db, empresa.id, tipo_dte="34", consumido=95, num_inicio=1, num_fin=100)
        # vencimiento-only CAF (tipo 39)
        _make_caf(db, empresa.id, tipo_dte="39", consumido=0, fecha_vencimiento=soon)
        # ambos CAF (tipo 33)
        _make_caf(db, empresa.id, tipo_dte="33", consumido=95, fecha_vencimiento=soon)
        db.commit()

        r = c.get("/api/cafs/alerts/")
        assert r.status_code == 200
        alerts = r.json()["alerts"]
        assert len(alerts) == 3
        urgencias = [a["urgencia"] for a in alerts]
        assert urgencias == ["ambos", "vencimiento", "stock"]

    def test_sorting_within_vencimiento_by_days_asc(self, _client_and_user, db):
        """Within same urgency, soonest expiry first."""
        c, empresa, user = _client_and_user

        later = date.today() + timedelta(days=20)
        sooner = date.today() + timedelta(days=5)
        # Register in reverse order to verify sorting works
        _make_caf(db, empresa.id, tipo_dte="34", consumido=0, fecha_vencimiento=later)
        _make_caf(db, empresa.id, tipo_dte="33", consumido=0, fecha_vencimiento=sooner)
        db.commit()

        r = c.get("/api/cafs/alerts/")
        assert r.status_code == 200
        alerts = r.json()["alerts"]
        assert len(alerts) == 2
        assert alerts[0]["dias_al_vencimiento"] == 5
        assert alerts[1]["dias_al_vencimiento"] == 20

    def test_no_empresa_id_returns_empty(self, db, _test_password_hash):
        """User with no empresa_id gets empty alerts, not 400."""
        from app.database import get_db
        from app.api.auth import get_current_user

        user = User(
            email="noempresa@caf.cl",
            name="No Empresa",
            hashed_password=_test_password_hash,
            role="vendedor",
            is_active=True,
            empresa_id=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        captured = user

        def _override_user():
            return captured

        def _override_db():
            yield db

        app.dependency_overrides[get_db] = _override_db
        app.dependency_overrides[get_current_user] = _override_user

        try:
            with TestClient(app) as c:
                r = c.get("/api/cafs/alerts/")
            assert r.status_code == 200
            data = r.json()
            assert data["count"] == 0
            assert data["alerts"] == []
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_current_user, None)

    def test_fecha_vencimiento_null_in_response(self, _client_and_user, db):
        """Stock-only alert has null fecha_vencimiento and null dias_al_vencimiento."""
        c, empresa, user = _client_and_user
        _make_caf(db, empresa.id, consumido=95)
        db.commit()

        r = c.get("/api/cafs/alerts/")
        alert = r.json()["alerts"][0]
        assert alert["fecha_vencimiento"] is None
        assert alert["dias_al_vencimiento"] is None
