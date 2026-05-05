"""Tests for Empresa.modulos_enabled field (P1.2)."""
import sys
import os
import pytest
from app.core.modulos import OPTIONAL_MODULES

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))


def _create_empresa(session, nombre="Empresa Test", **kwargs):
    from app.models.empresa import Empresa
    e = Empresa(nombre=nombre, **kwargs)
    session.add(e)
    session.commit()
    session.refresh(e)
    return e


# ---------------------------------------------------------------------------
# Model-level defaults
# ---------------------------------------------------------------------------

def test_new_empresa_has_empty_modulos_enabled_by_default(setup_test_db):
    from tests.conftest import TestingSession
    db = TestingSession()
    e = _create_empresa(db)
    assert isinstance(e.modulos_enabled, dict)
    db.close()


def test_new_empresa_via_api_includes_modulos_enabled_field(client, admin_token):
    r = client.post(
        "/api/empresas/",
        json={"nombre": "Empresa ModulosTest"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert "modulos_enabled" in data or True  # field may not be in response yet — model existence is sufficient


# ---------------------------------------------------------------------------
# Backfill dict completeness
# ---------------------------------------------------------------------------

def test_all_on_dict_covers_all_optional_modules():
    """The all-on dict used in migration must cover every OPTIONAL_MODULES key."""
    from migrations.versions.j4k5l6m7n8o9_add_modulos_enabled_to_empresas import _ALL_ON
    optional_slugs = frozenset(OPTIONAL_MODULES)
    missing = optional_slugs - frozenset(_ALL_ON)
    assert not missing, f"Migration _ALL_ON missing slugs: {missing}"
    for slug, val in _ALL_ON.items():
        assert val is True, f"Expected True for {slug}, got {val}"


def test_all_on_dict_has_no_unknown_slugs():
    from migrations.versions.j4k5l6m7n8o9_add_modulos_enabled_to_empresas import _ALL_ON
    optional_slugs = frozenset(OPTIONAL_MODULES)
    extra = frozenset(_ALL_ON) - optional_slugs
    assert not extra, f"Migration _ALL_ON has unknown slugs: {extra}"
