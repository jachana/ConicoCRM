"""Integration tests for require_modulo gating on procurement, inventario, and finanzas routers.

For each gated module we verify:
  - 403 + modulo_disabled detail when the empresa has that module explicitly OFF
  - non-403 (200 or 201) when the empresa has all modules ON (admin_token fixture)
"""

import pytest
from tests.conftest import TestingSession
from app.core.security import get_password_hash

_BLOCKED_HASH = get_password_hash("secret123")


def _make_blocked_token(client, module_slug: str) -> str:
    from app.models.empresa import Empresa
    from app.models.user import User
    from app.core.modulos import OPTIONAL_MODULES

    db = TestingSession()
    modulos = {slug: True for slug in OPTIONAL_MODULES}
    modulos[module_slug] = False

    empresa = Empresa(nombre=f"Empresa sin {module_slug}", modulos_enabled=modulos)
    db.add(empresa)
    db.flush()

    email = f"blocked_p15_{module_slug}@test.cl"
    user = User(
        email=email,
        name="Blocked",
        hashed_password=_BLOCKED_HASH,
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
# proveedores
# ---------------------------------------------------------------------------

def test_proveedores_blocked_when_module_off(client):
    token = _make_blocked_token(client, "proveedores")
    r = client.get("/api/proveedores/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "proveedores"


def test_proveedores_accessible_when_module_on(client, admin_token):
    r = client.get("/api/proveedores/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# ordenes_compra
# ---------------------------------------------------------------------------

def test_ordenes_compra_blocked_when_module_off(client):
    token = _make_blocked_token(client, "ordenes_compra")
    r = client.get("/api/ordenes-compra/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "ordenes_compra"


def test_ordenes_compra_accessible_when_module_on(client, admin_token):
    r = client.get("/api/ordenes-compra/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# facturas_compra
# ---------------------------------------------------------------------------

def test_facturas_compra_blocked_when_module_off(client):
    token = _make_blocked_token(client, "facturas_compra")
    r = client.get("/api/facturas-compra/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "facturas_compra"


def test_facturas_compra_accessible_when_module_on(client, admin_token):
    r = client.get("/api/facturas-compra/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# inventario
# ---------------------------------------------------------------------------

def test_inventario_blocked_when_module_off(client):
    token = _make_blocked_token(client, "inventario")
    r = client.get("/api/inventario/movimientos", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "inventario"


def test_inventario_accessible_when_module_on(client, admin_token):
    r = client.get("/api/inventario/movimientos", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# listas_precios
# ---------------------------------------------------------------------------

def test_listas_precios_blocked_when_module_off(client):
    token = _make_blocked_token(client, "listas_precios")
    r = client.get("/api/listas-precios/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "listas_precios"


def test_listas_precios_accessible_when_module_on(client, admin_token):
    r = client.get("/api/listas-precios/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# pagos
# ---------------------------------------------------------------------------

def test_pagos_blocked_when_module_off(client):
    token = _make_blocked_token(client, "pagos")
    r = client.get("/api/pagos/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "pagos"


def test_pagos_accessible_when_module_on(client, admin_token):
    r = client.get("/api/pagos/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# cobranza
# ---------------------------------------------------------------------------

def test_cobranza_blocked_when_module_off(client):
    token = _make_blocked_token(client, "cobranza")
    r = client.get("/api/cobranza/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "cobranza"


def test_cobranza_accessible_when_module_on(client, admin_token):
    r = client.get("/api/cobranza/dashboard", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# bancos_receptores
# ---------------------------------------------------------------------------

def test_bancos_receptores_blocked_when_module_off(client):
    token = _make_blocked_token(client, "bancos_receptores")
    r = client.get("/api/bancos-receptores/", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["error"] == "modulo_disabled"
    assert detail["slug"] == "bancos_receptores"


def test_bancos_receptores_accessible_when_module_on(client, admin_token):
    r = client.get("/api/bancos-receptores/", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
