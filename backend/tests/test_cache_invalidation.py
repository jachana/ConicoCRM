"""Unit tests for cache-invalidation logic wired into auditoria.py and the API
layer (Producto / OrdenCompra which lack empresa_id on the model).

All tests are pure unit tests — no DB, no HTTP client.  The cache singleton is
patched in-process.
"""
from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest

import app.core.cache as cache_module
from app.core.cache import ReportCache
from app.services.auditoria import (
    _CACHE_INVALIDATION_MAP,
    _CACHE_PENDING_KEY,
    _accumulate_cache_invalidations,
    _after_commit,
    _after_rollback,
    invalidate_cache_for_empresa,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_cache() -> ReportCache:
    mock_client = MagicMock()
    mock_client.scan.return_value = (0, [])
    with patch("redis.from_url", return_value=mock_client):
        return ReportCache("redis://localhost:6379/0")


def _make_session(pending: dict | None = None) -> MagicMock:
    session = MagicMock()
    info: dict = {}
    if pending is not None:
        info[_CACHE_PENDING_KEY] = pending
    session.info = info
    return session


# ---------------------------------------------------------------------------
# 1. _CACHE_INVALIDATION_MAP sanity check
# ---------------------------------------------------------------------------

def test_invalidation_map_factura():
    endpoints = _CACHE_INVALIDATION_MAP["Factura"]
    for ep in ("ventas", "cobranza", "margenes", "dte", "kpis", "por_marca"):
        assert ep in endpoints


def test_invalidation_map_nota_venta():
    assert "ventas" in _CACHE_INVALIDATION_MAP["NotaVenta"]
    assert "kpis" in _CACHE_INVALIDATION_MAP["NotaVenta"]


def test_invalidation_map_cliente():
    assert "cobranza" in _CACHE_INVALIDATION_MAP["Cliente"]


# ---------------------------------------------------------------------------
# 2. _accumulate_cache_invalidations
# ---------------------------------------------------------------------------

def _fake_instance(classname: str, empresa_id: int | None) -> MagicMock:
    inst = MagicMock()
    type(inst).__name__ = classname
    inst.empresa_id = empresa_id
    return inst


def test_accumulate_adds_factura_endpoints():
    session = _make_session()
    factura = _fake_instance("Factura", empresa_id=42)
    _accumulate_cache_invalidations(session, [factura])

    pending = session.info[_CACHE_PENDING_KEY]
    assert 42 in pending
    assert "ventas" in pending[42]
    assert "margenes" in pending[42]
    assert "dte" in pending[42]


def test_accumulate_skips_instance_without_empresa_id():
    session = _make_session()
    producto = _fake_instance("Producto", empresa_id=None)
    _accumulate_cache_invalidations(session, [producto])

    pending = session.info.get(_CACHE_PENDING_KEY, {})
    assert pending == {}


def test_accumulate_skips_unknown_model():
    session = _make_session()
    other = _fake_instance("SomeOtherModel", empresa_id=7)
    _accumulate_cache_invalidations(session, [other])

    pending = session.info.get(_CACHE_PENDING_KEY, {})
    assert pending == {}


def test_accumulate_merges_multiple_instances_same_empresa():
    session = _make_session()
    f1 = _fake_instance("Factura", empresa_id=1)
    nv = _fake_instance("NotaVenta", empresa_id=1)
    _accumulate_cache_invalidations(session, [f1, nv])

    endpoints = session.info[_CACHE_PENDING_KEY][1]
    # Factura contributes: ventas, cobranza, margenes, dte, kpis, por_marca
    # NotaVenta contributes: ventas, kpis
    assert "cobranza" in endpoints
    assert "ventas" in endpoints
    assert "kpis" in endpoints


# ---------------------------------------------------------------------------
# 3. _after_commit fires invalidate_pattern
# ---------------------------------------------------------------------------

def test_after_commit_calls_invalidate_pattern():
    rc = _make_mock_cache()
    cache_module.report_cache = rc

    session = _make_session(pending={5: {"ventas", "kpis"}})
    _after_commit(session)

    # After commit the pending key is consumed.
    assert _CACHE_PENDING_KEY not in session.info
    # invalidate_pattern was called on the redis client (scan per endpoint).
    assert rc._client.scan.call_count == 2  # one per endpoint

    cache_module.report_cache = None


def test_after_commit_noop_when_no_pending():
    rc = _make_mock_cache()
    cache_module.report_cache = rc

    session = _make_session(pending={})
    _after_commit(session)

    rc._client.scan.assert_not_called()
    cache_module.report_cache = None


def test_after_commit_noop_when_cache_not_initialized():
    cache_module.report_cache = None

    session = _make_session(pending={3: {"ventas"}})
    # Must not raise even when cache is None.
    _after_commit(session)


def test_after_commit_swallows_redis_error():
    from redis.exceptions import RedisError

    rc = _make_mock_cache()
    rc._client.scan.side_effect = RedisError("boom")
    cache_module.report_cache = rc

    session = _make_session(pending={1: {"ventas"}})
    _after_commit(session)  # must not raise

    cache_module.report_cache = None


# ---------------------------------------------------------------------------
# 4. _after_rollback clears pending
# ---------------------------------------------------------------------------

def test_after_rollback_clears_pending():
    session = _make_session(pending={1: {"ventas"}})
    _after_rollback(session)
    assert _CACHE_PENDING_KEY not in session.info


# ---------------------------------------------------------------------------
# 5. invalidate_cache_for_empresa (API helper for models without empresa_id)
# ---------------------------------------------------------------------------

def test_invalidate_cache_for_empresa_calls_pattern():
    rc = _make_mock_cache()
    rc._client.scan.return_value = (0, ["cache:report:9:compras:abc"])
    cache_module.report_cache = rc

    invalidate_cache_for_empresa(9, ["compras", "kpis"])

    assert rc._client.scan.call_count == 2
    cache_module.report_cache = None


def test_invalidate_cache_for_empresa_noop_when_none():
    rc = _make_mock_cache()
    cache_module.report_cache = rc

    invalidate_cache_for_empresa(None, ["compras"])

    rc._client.scan.assert_not_called()
    cache_module.report_cache = None


def test_invalidate_cache_for_empresa_noop_when_cache_off():
    cache_module.report_cache = None
    # Must not raise.
    invalidate_cache_for_empresa(1, ["compras", "kpis"])


def test_invalidate_cache_for_empresa_swallows_errors():
    from redis.exceptions import RedisError

    rc = _make_mock_cache()
    rc._client.scan.side_effect = RedisError("timeout")
    cache_module.report_cache = rc

    invalidate_cache_for_empresa(3, ["inventario"])  # must not raise

    cache_module.report_cache = None


# ---------------------------------------------------------------------------
# 6. E2E integration test with fakeredis
# ---------------------------------------------------------------------------

try:
    import fakeredis
    _FAKEREDIS_AVAILABLE = True
except ImportError:
    _FAKEREDIS_AVAILABLE = False


@pytest.mark.skipif(not _FAKEREDIS_AVAILABLE, reason="fakeredis not installed")
def test_e2e_set_and_invalidate_removes_key():
    """Prime a cache key then invalidate it; verify cache.get returns None."""
    fake_server = fakeredis.FakeServer()
    fake_client = fakeredis.FakeRedis(server=fake_server, decode_responses=True)

    with patch("redis.from_url", return_value=fake_client):
        rc = ReportCache("redis://localhost:6379/0")

    empresa_id = 42
    endpoint = "ventas"
    filters = {"mes": 3, "anio": 2025}
    value = {"total": 1234, "items": []}

    # Prime the cache.
    rc.set(empresa_id, endpoint, filters, value, ttl=120)

    # Verify the value is cached.
    cached = rc.get(empresa_id, endpoint, filters)
    assert cached == value, "Value should be retrievable after set"

    # Invalidate the endpoint.
    rc.invalidate_pattern(empresa_id, [endpoint])

    # After invalidation the key must be gone.
    result = rc.get(empresa_id, endpoint, filters)
    assert result is None, "Value should be None after invalidation"


@pytest.mark.skipif(not _FAKEREDIS_AVAILABLE, reason="fakeredis not installed")
def test_e2e_invalidate_only_matching_empresa():
    """Invalidation of empresa 1 must not affect empresa 2's cached keys."""
    fake_server = fakeredis.FakeServer()
    fake_client = fakeredis.FakeRedis(server=fake_server, decode_responses=True)

    with patch("redis.from_url", return_value=fake_client):
        rc = ReportCache("redis://localhost:6379/0")

    filters = {"mes": 1}
    rc.set(1, "ventas", filters, {"total": 100}, ttl=120)
    rc.set(2, "ventas", filters, {"total": 200}, ttl=120)

    # Invalidate empresa 1 only.
    rc.invalidate_pattern(1, ["ventas"])

    assert rc.get(1, "ventas", filters) is None
    assert rc.get(2, "ventas", filters) == {"total": 200}


@pytest.mark.skipif(not _FAKEREDIS_AVAILABLE, reason="fakeredis not installed")
def test_e2e_invalidate_only_matching_endpoint():
    """Invalidating 'ventas' must leave 'cobranza' keys intact."""
    fake_server = fakeredis.FakeServer()
    fake_client = fakeredis.FakeRedis(server=fake_server, decode_responses=True)

    with patch("redis.from_url", return_value=fake_client):
        rc = ReportCache("redis://localhost:6379/0")

    filters = {"mes": 1}
    rc.set(5, "ventas", filters, {"v": 1}, ttl=120)
    rc.set(5, "cobranza", filters, {"c": 2}, ttl=120)

    rc.invalidate_pattern(5, ["ventas"])

    assert rc.get(5, "ventas", filters) is None
    assert rc.get(5, "cobranza", filters) == {"c": 2}
