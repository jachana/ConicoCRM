"""Tests for P1.7: /empresas/{id}/modulos and /me/modulos endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import TestingSession


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def empresa_sin_modulos(setup_test_db):
    from app.models.empresa import Empresa
    db = TestingSession()
    e = Empresa(nombre="Empresa Test Modulos", modulos_enabled={})
    db.add(e)
    db.commit()
    db.refresh(e)
    db.close()
    return e


@pytest.fixture
def empresa_con_cotizaciones(setup_test_db):
    from app.models.empresa import Empresa
    db = TestingSession()
    e = Empresa(
        nombre="Empresa Con Cotizaciones",
        modulos_enabled={"cotizaciones": True},
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    db.close()
    return e


@pytest.fixture
def vendedor_en_empresa(setup_test_db, empresa_sin_modulos, _test_password_hash):
    from app.models.user import User
    db = TestingSession()
    user = User(
        email="vendedor_mod@conico.cl",
        name="Vendedor Modulos",
        hashed_password=_test_password_hash,
        role="vendedor",
        empresa_id=empresa_sin_modulos.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


@pytest.fixture
def vendedor_mod_token(client, vendedor_en_empresa):
    resp = client.post(
        "/api/auth/login",
        data={"username": "vendedor_mod@conico.cl", "password": "secret123"},
    )
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# GET /empresas/{id}/modulos
# ---------------------------------------------------------------------------

def test_get_empresa_modulos_admin(client, admin_token, empresa_sin_modulos):
    resp = client.get(
        f"/api/empresas/{empresa_sin_modulos.id}/modulos",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "stored" in data
    assert "effective" in data
    assert "registry" in data
    assert isinstance(data["registry"], list)
    assert len(data["registry"]) > 0
    entry = next(e for e in data["registry"] if e["slug"] == "facturas")
    assert entry["label"] == "Facturas"
    assert "notas_venta" in entry["requires"]


def test_get_empresa_modulos_requires_admin(client, vendedor_token, admin_user):
    from app.models.empresa import Empresa
    db = TestingSession()
    e = db.get(Empresa, admin_user.empresa_id)
    eid = e.id
    db.close()
    resp = client.get(
        f"/api/empresas/{eid}/modulos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_get_empresa_modulos_unauthenticated(client, empresa_sin_modulos):
    resp = client.get(f"/api/empresas/{empresa_sin_modulos.id}/modulos")
    assert resp.status_code == 401


def test_get_empresa_modulos_404(client, admin_token):
    resp = client.get(
        "/api/empresas/999999/modulos",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /me/modulos
# ---------------------------------------------------------------------------

def test_me_modulos_returns_effective(client, vendedor_mod_token, empresa_sin_modulos):
    resp = client.get(
        "/api/me/modulos",
        headers={"Authorization": f"Bearer {vendedor_mod_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "effective" in data
    assert isinstance(data["effective"], dict)


def test_me_modulos_vendedor_no_admin_required(client, vendedor_token):
    resp = client.get(
        "/api/me/modulos",
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 200


def test_me_modulos_unauthenticated(client):
    resp = client.get("/api/me/modulos")
    assert resp.status_code == 401


def test_me_modulos_reflects_stored(client, admin_token, admin_user):
    """Admin's empresa has all modules enabled; effective should include them."""
    resp = client.get(
        "/api/me/modulos",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["effective"].get("cotizaciones") is True


# ---------------------------------------------------------------------------
# PATCH /empresas/{id}/modulos
# ---------------------------------------------------------------------------

def test_patch_enable_module(client, admin_token, empresa_sin_modulos):
    resp = client.patch(
        f"/api/empresas/{empresa_sin_modulos.id}/modulos",
        json={"modulos": {"cotizaciones": True}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["stored"].get("cotizaciones") is True


def test_patch_disable_module_cascade(client, admin_token, empresa_con_cotizaciones):
    # Enable notas_venta first (depends on cotizaciones)
    client.patch(
        f"/api/empresas/{empresa_con_cotizaciones.id}/modulos",
        json={"modulos": {"notas_venta": True}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # Disable cotizaciones → should cascade-disable notas_venta too
    resp = client.patch(
        f"/api/empresas/{empresa_con_cotizaciones.id}/modulos",
        json={"modulos": {"cotizaciones": False}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["stored"].get("cotizaciones") is False
    assert data["stored"].get("notas_venta") is False


def test_patch_dependency_violation_on_enable(client, admin_token, empresa_sin_modulos):
    """Enabling notas_venta without cotizaciones → 400 dependency_violation."""
    resp = client.patch(
        f"/api/empresas/{empresa_sin_modulos.id}/modulos",
        json={"modulos": {"notas_venta": True}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["error"] == "dependency_violation"


def test_patch_unknown_slug(client, admin_token, empresa_sin_modulos):
    resp = client.patch(
        f"/api/empresas/{empresa_sin_modulos.id}/modulos",
        json={"modulos": {"slug_que_no_existe_xyz": True}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["error"] == "unknown_slug"


def test_patch_requires_admin(client, vendedor_token, empresa_sin_modulos):
    resp = client.patch(
        f"/api/empresas/{empresa_sin_modulos.id}/modulos",
        json={"modulos": {"cotizaciones": True}},
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 403


def test_patch_idempotent_no_audit(client, admin_token, empresa_con_cotizaciones):
    """Toggling cotizaciones=True when already True should succeed but produce no audit."""
    from app.models.audit_log import AuditLog
    # First verify cotizaciones is already True
    resp = client.get(
        f"/api/empresas/{empresa_con_cotizaciones.id}/modulos",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.json()["stored"].get("cotizaciones") is True

    db = TestingSession()
    count_before = db.query(AuditLog).filter(
        AuditLog.entity_type == "Empresa",
        AuditLog.entity_id == str(empresa_con_cotizaciones.id),
        AuditLog.action == "modulos.toggle",
    ).count()
    db.close()

    resp = client.patch(
        f"/api/empresas/{empresa_con_cotizaciones.id}/modulos",
        json={"modulos": {"cotizaciones": True}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    db = TestingSession()
    count_after = db.query(AuditLog).filter(
        AuditLog.entity_type == "Empresa",
        AuditLog.entity_id == str(empresa_con_cotizaciones.id),
        AuditLog.action == "modulos.toggle",
    ).count()
    db.close()

    assert count_after == count_before


def test_patch_generates_audit_log(client, admin_token, empresa_sin_modulos):
    from app.models.audit_log import AuditLog
    resp = client.patch(
        f"/api/empresas/{empresa_sin_modulos.id}/modulos",
        json={"modulos": {"cotizaciones": True}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    db = TestingSession()
    log = db.query(AuditLog).filter(
        AuditLog.entity_type == "Empresa",
        AuditLog.entity_id == str(empresa_sin_modulos.id),
        AuditLog.action == "modulos.toggle",
    ).first()
    db.close()

    assert log is not None
    assert log.diff_json is not None
    diff = log.diff_json["diff"]
    slugs_changed = [d["slug"] for d in diff]
    assert "cotizaciones" in slugs_changed
    cot_entry = next(d for d in diff if d["slug"] == "cotizaciones")
    assert cot_entry["before"] is False
    assert cot_entry["after"] is True


def test_patch_audit_with_admin_user_id(client, admin_token, admin_user, empresa_sin_modulos):
    from app.models.audit_log import AuditLog
    client.patch(
        f"/api/empresas/{empresa_sin_modulos.id}/modulos",
        json={"modulos": {"cotizaciones": True}},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    db = TestingSession()
    log = db.query(AuditLog).filter(
        AuditLog.entity_type == "Empresa",
        AuditLog.entity_id == str(empresa_sin_modulos.id),
        AuditLog.action == "modulos.toggle",
    ).first()
    db.close()
    assert log.user_id == admin_user.id
