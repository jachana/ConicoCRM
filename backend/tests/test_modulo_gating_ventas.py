"""Integration tests for require_modulo gating on ventas routers.

For each gated module we verify:
  - 403 + modulo_disabled detail when the empresa has that module explicitly OFF
  - non-403 (200 or 201) when the empresa has all modules ON (admin_token fixture)
"""

import pytest
from tests.conftest import TestingSession


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _make_blocked_token(client, module_slug: str) -> str:
    """Create a user whose empresa has module_slug = False, return JWT token."""
    from app.models.empresa import Empresa
    from app.models.user import User
    from app.core.modulos import OPTIONAL_MODULES
    from app.core.security import get_password_hash

    db = TestingSession()
    # All modules on except the target slug
    modulos = {slug: True for slug in OPTIONAL_MODULES}
    modulos[module_slug] = False

    empresa = Empresa(nombre=f"Empresa sin {module_slug}", modulos_enabled=modulos)
    db.add(empresa)
    db.flush()

    email = f"blocked_{module_slug}@test.cl"
    user = User(
        email=email,
        name="Blocked",
        hashed_password=get_password_hash("secret123"),
        role="admin",
        empresa_id=empresa.id,
    )
    db.add(user)
    db.commit()
    db.close()

    resp = client.post(
        "/api/auth/login",
        data={"username": email, "password": "secret123"},
    )
    assert resp.status_code == 200, f"login failed for {email}: {resp.text}"
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# boletas
# ---------------------------------------------------------------------------

def test_boletas_blocked_when_module_off(client):
    token = _make_blocked_token(client, "boletas")
    r = client.get("/api/boletas/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "boletas"


def test_boletas_accessible_when_module_on(client, admin_token):
    r = client.get("/api/boletas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# facturas
# ---------------------------------------------------------------------------

def test_facturas_blocked_when_module_off(client):
    token = _make_blocked_token(client, "facturas")
    r = client.get("/api/facturas/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "facturas"


def test_facturas_accessible_when_module_on(client, admin_token):
    r = client.get("/api/facturas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# guias_despacho
# ---------------------------------------------------------------------------

def test_guias_despacho_blocked_when_module_off(client):
    token = _make_blocked_token(client, "guias_despacho")
    r = client.get("/api/guias-despacho/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "guias_despacho"


def test_guias_despacho_accessible_when_module_on(client, admin_token):
    r = client.get("/api/guias-despacho/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# cotizaciones
# ---------------------------------------------------------------------------

def test_cotizaciones_blocked_when_module_off(client):
    token = _make_blocked_token(client, "cotizaciones")
    r = client.get("/api/cotizaciones/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "cotizaciones"


def test_cotizaciones_accessible_when_module_on(client, admin_token):
    r = client.get("/api/cotizaciones/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# notas_venta
# ---------------------------------------------------------------------------

def test_notas_venta_blocked_when_module_off(client):
    token = _make_blocked_token(client, "notas_venta")
    r = client.get("/api/nota_ventas/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "notas_venta"


def test_notas_venta_accessible_when_module_on(client, admin_token):
    r = client.get("/api/nota_ventas/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# nota_credito
# ---------------------------------------------------------------------------

def test_nota_credito_blocked_when_module_off(client):
    token = _make_blocked_token(client, "nota_credito")
    r = client.get("/api/dte/notas-credito/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "nota_credito"


def test_nota_credito_accessible_when_module_on(client, admin_token):
    r = client.get("/api/dte/notas-credito/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# nota_debito
# ---------------------------------------------------------------------------

def test_nota_debito_blocked_when_module_off(client):
    token = _make_blocked_token(client, "nota_debito")
    r = client.get("/api/dte/notas-debito/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "nota_debito"


def test_nota_debito_accessible_when_module_on(client, admin_token):
    r = client.get("/api/dte/notas-debito/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
