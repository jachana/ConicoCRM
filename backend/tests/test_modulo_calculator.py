"""Unit tests for modulo_calculator and require_modulo dep (P1.3)."""
import pytest
from unittest.mock import MagicMock, patch

from app.services.modulo_calculator import (
    compute_effective_modulos,
    compute_cascade,
    validate_toggle,
    ModuloValidationError,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def all_on():
    """All optional modules enabled."""
    from app.core.modulos import OPTIONAL_MODULES
    return {slug: True for slug in OPTIONAL_MODULES}


@pytest.fixture
def all_off():
    from app.core.modulos import OPTIONAL_MODULES
    return {slug: False for slug in OPTIONAL_MODULES}


# ---------------------------------------------------------------------------
# compute_effective_modulos
# ---------------------------------------------------------------------------

def test_effective_dte_emission_on_when_facturas_on(all_off):
    state = dict(all_off)
    state["facturas"] = True
    eff = compute_effective_modulos(state)
    assert eff["dte_emission"] is True


def test_effective_dte_emission_on_when_boletas_on(all_off):
    state = dict(all_off)
    state["boletas"] = True
    eff = compute_effective_modulos(state)
    assert eff["dte_emission"] is True


def test_effective_dte_emission_on_when_guias_on(all_off):
    state = dict(all_off)
    state["guias_despacho"] = True
    eff = compute_effective_modulos(state)
    assert eff["dte_emission"] is True


def test_effective_dte_emission_on_when_nc_on(all_off):
    state = dict(all_off)
    state["nota_credito"] = True
    eff = compute_effective_modulos(state)
    assert eff["dte_emission"] is True


def test_effective_dte_emission_on_when_nd_on(all_off):
    state = dict(all_off)
    state["nota_debito"] = True
    eff = compute_effective_modulos(state)
    assert eff["dte_emission"] is True


def test_effective_dte_emission_off_when_no_dte_docs(all_off):
    eff = compute_effective_modulos(all_off)
    assert eff["dte_emission"] is False


def test_effective_preserves_all_stored_keys(all_on):
    eff = compute_effective_modulos(all_on)
    for slug in all_on:
        assert slug in eff
    assert "dte_emission" in eff


# ---------------------------------------------------------------------------
# validate_toggle — activating
# ---------------------------------------------------------------------------

def test_validate_toggle_activate_nota_credito_without_facturas_raises(all_off):
    state = dict(all_off)
    # nota_credito requires facturas
    with pytest.raises(ModuloValidationError) as exc:
        validate_toggle(state, "nota_credito", True)
    assert exc.value.slug == "nota_credito"


def test_validate_toggle_activate_nota_credito_with_facturas_ok(all_off):
    state = dict(all_off)
    state["facturas"] = True
    # should not raise
    validate_toggle(state, "nota_credito", True)


def test_validate_toggle_activate_pagos_without_facturas_raises(all_off):
    state = dict(all_off)
    with pytest.raises(ModuloValidationError) as exc:
        validate_toggle(state, "pagos", True)
    assert exc.value.slug == "pagos"


def test_validate_toggle_activate_no_requires_always_ok(all_off):
    # boletas has no requires
    validate_toggle(all_off, "boletas", True)


# ---------------------------------------------------------------------------
# validate_toggle — deactivating
# ---------------------------------------------------------------------------

def test_validate_toggle_deactivate_facturas_with_pagos_on_raises(all_off):
    state = dict(all_off)
    state["facturas"] = True
    state["pagos"] = True
    with pytest.raises(ModuloValidationError) as exc:
        validate_toggle(state, "facturas", False)
    assert exc.value.slug == "facturas"


def test_validate_toggle_deactivate_facturas_no_dependents_on_ok(all_off):
    state = dict(all_off)
    state["facturas"] = True
    # All dependents off → deactivation is safe
    validate_toggle(state, "facturas", False)


def test_validate_toggle_unknown_slug_raises_key_error():
    with pytest.raises(KeyError):
        validate_toggle({}, "nonexistent_xyz", True)


# ---------------------------------------------------------------------------
# compute_cascade — turn off
# ---------------------------------------------------------------------------

def test_cascade_off_facturas_includes_pagos_cobranza_nc_nd_libros(all_on):
    diff = compute_cascade(all_on, "facturas", False)
    assert diff["facturas"] is False
    assert diff.get("pagos") is False
    assert diff.get("cobranza") is False
    assert diff.get("nota_credito") is False
    assert diff.get("nota_debito") is False
    assert diff.get("libros") is False


def test_cascade_off_facturas_includes_dte_recepcion(all_on):
    diff = compute_cascade(all_on, "facturas", False)
    assert diff.get("dte_recepcion") is False


def test_cascade_off_cobranza_includes_bancos_receptores(all_on):
    diff = compute_cascade(all_on, "cobranza", False)
    assert diff.get("bancos_receptores") is False


def test_cascade_off_only_affects_currently_on_modules():
    state = {"facturas": True, "pagos": False, "cobranza": True}
    diff = compute_cascade(state, "facturas", False)
    # pagos was already off, should not appear in diff
    assert "pagos" not in diff
    assert diff.get("cobranza") is False


def test_cascade_off_facturas_returns_facturas_itself():
    state = {"facturas": True}
    diff = compute_cascade(state, "facturas", False)
    assert diff["facturas"] is False


# ---------------------------------------------------------------------------
# compute_cascade — turn on
# ---------------------------------------------------------------------------

def test_cascade_on_returns_only_the_slug():
    state = {"facturas": False}
    diff = compute_cascade(state, "facturas", True)
    assert diff == {"facturas": True}


def test_cascade_unknown_slug_raises():
    with pytest.raises(KeyError):
        compute_cascade({}, "nonexistent_xyz", False)


# ---------------------------------------------------------------------------
# require_modulo FastAPI dependency
# ---------------------------------------------------------------------------

def _make_user(empresa_modulos: dict | None = None, empresa_id: int | None = 1):
    user = MagicMock()
    user.empresa_id = empresa_id
    if empresa_id is not None:
        empresa = MagicMock()
        empresa.modulos_enabled = empresa_modulos or {}
        user._empresa = empresa
    else:
        user._empresa = None
    return user


def test_require_modulo_allows_when_module_on(client, admin_token):
    """Integration smoke: require_modulo returns 403 when module off (needs real route)."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.deps import require_modulo

    mini = FastAPI()

    @mini.get("/test-gate")
    def _gate(user=require_modulo("facturas")):
        return {"ok": True}

    # Patch get_current_user and get_db on the mini app
    from app.models.empresa import Empresa as _Empresa
    fake_empresa = MagicMock(spec=_Empresa)
    fake_empresa.modulos_enabled = {"facturas": True}

    fake_user = MagicMock()
    fake_user.empresa_id = 99

    fake_db = MagicMock()
    fake_db.get.return_value = fake_empresa

    from app.api.auth import get_current_user as _gcu
    from app.database import get_db as _gdb

    mini.dependency_overrides[_gcu] = lambda: fake_user
    mini.dependency_overrides[_gdb] = lambda: fake_db

    tc = TestClient(mini)
    resp = tc.get("/test-gate")
    assert resp.status_code == 200


def test_require_modulo_returns_403_when_module_off():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.deps import require_modulo
    from app.models.empresa import Empresa as _Empresa
    from app.api.auth import get_current_user as _gcu
    from app.database import get_db as _gdb

    mini = FastAPI()

    @mini.get("/test-gate")
    def _gate(user=require_modulo("facturas")):
        return {"ok": True}

    fake_empresa = MagicMock(spec=_Empresa)
    fake_empresa.modulos_enabled = {"facturas": False}

    fake_user = MagicMock()
    fake_user.empresa_id = 99

    fake_db = MagicMock()
    fake_db.get.return_value = fake_empresa

    mini.dependency_overrides[_gcu] = lambda: fake_user
    mini.dependency_overrides[_gdb] = lambda: fake_db

    tc = TestClient(mini)
    resp = tc.get("/test-gate")
    assert resp.status_code == 403
    body = resp.json()
    assert body["detail"]["error"] == "modulo_disabled"
    assert body["detail"]["slug"] == "facturas"
    assert "label" in body["detail"]


def test_require_modulo_403_includes_label():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.deps import require_modulo
    from app.models.empresa import Empresa as _Empresa
    from app.api.auth import get_current_user as _gcu
    from app.database import get_db as _gdb

    mini = FastAPI()

    @mini.get("/test")
    def _gate(user=require_modulo("boletas")):
        return {"ok": True}

    fake_empresa = MagicMock(spec=_Empresa)
    fake_empresa.modulos_enabled = {}  # boletas not on

    fake_user = MagicMock()
    fake_user.empresa_id = 1

    fake_db = MagicMock()
    fake_db.get.return_value = fake_empresa

    mini.dependency_overrides[_gcu] = lambda: fake_user
    mini.dependency_overrides[_gdb] = lambda: fake_db

    tc = TestClient(mini)
    resp = tc.get("/test")
    assert resp.status_code == 403
    detail = resp.json()["detail"]
    assert detail["label"] == "Boletas"
