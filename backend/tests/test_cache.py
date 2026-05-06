from __future__ import annotations

import hashlib
import json
from unittest.mock import MagicMock, patch, call

import pytest
from redis.exceptions import RedisError

import app.core.cache as cache_module
from app.core.cache import ReportCache, init_report_cache, get_report_cache


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_cache() -> tuple[ReportCache, MagicMock]:
    """Return a ReportCache instance with a mocked Redis client."""
    mock_client = MagicMock()
    with patch("redis.from_url", return_value=mock_client):
        rc = ReportCache("redis://localhost:6379/0")
    return rc, mock_client


# ---------------------------------------------------------------------------
# test_cache_miss
# ---------------------------------------------------------------------------

def test_cache_miss():
    rc, mock_client = _make_cache()
    mock_client.get.return_value = None

    result = rc.get(1, "ventas", {"mes": 1})

    assert result is None
    mock_client.get.assert_called_once()


# ---------------------------------------------------------------------------
# test_cache_set_and_hit
# ---------------------------------------------------------------------------

def test_cache_set_and_hit():
    rc, mock_client = _make_cache()
    value = {"total": 999, "items": [1, 2, 3]}

    # Simulate set, then get returning the serialized value
    rc.set(1, "ventas", {"mes": 1}, value, ttl=120)
    mock_client.set.assert_called_once()

    raw = json.dumps(value, ensure_ascii=False)
    mock_client.get.return_value = raw

    result = rc.get(1, "ventas", {"mes": 1})
    assert result == value


# ---------------------------------------------------------------------------
# test_cache_key_format
# ---------------------------------------------------------------------------

def test_cache_key_format():
    rc, _ = _make_cache()
    filters = {"mes": 3, "año": 2025}
    key = rc._build_key(7, "margenes", filters)

    sorted_raw = json.dumps(filters, sort_keys=True, ensure_ascii=False)
    expected_hash = hashlib.md5(sorted_raw.encode("utf-8")).hexdigest()
    expected_key = f"cache:report:7:margenes:{expected_hash}"

    assert key == expected_key
    assert key.startswith("cache:report:7:margenes:")


# ---------------------------------------------------------------------------
# test_invalidate_pattern
# ---------------------------------------------------------------------------

def test_invalidate_pattern():
    rc, mock_client = _make_cache()

    # scan returns (cursor=0, keys) on first call — cursor 0 means done
    mock_client.scan.return_value = (0, ["cache:report:5:ventas:abc123"])

    rc.invalidate_pattern(5, ["ventas", "kpis"])

    # scan called once per endpoint
    assert mock_client.scan.call_count == 2
    # delete called for the key returned in ventas scan; kpis scan returned same mock
    assert mock_client.delete.call_count == 2


# ---------------------------------------------------------------------------
# test_redis_connection_error
# ---------------------------------------------------------------------------

def test_redis_connection_error_on_get():
    rc, mock_client = _make_cache()
    mock_client.get.side_effect = RedisError("connection refused")

    result = rc.get(1, "ventas", {})
    assert result is None


def test_redis_connection_error_on_set():
    rc, mock_client = _make_cache()
    mock_client.set.side_effect = RedisError("connection refused")

    # Must not raise
    rc.set(1, "ventas", {}, {"data": 1}, ttl=120)


# ---------------------------------------------------------------------------
# test module-level singleton helpers
# ---------------------------------------------------------------------------

def test_init_and_get_report_cache():
    cache_module.report_cache = None

    with patch("redis.from_url", return_value=MagicMock()):
        init_report_cache("redis://localhost:6379/0")

    assert get_report_cache() is not None
    assert isinstance(get_report_cache(), ReportCache)

    # cleanup
    cache_module.report_cache = None


def test_get_report_cache_returns_none_before_init():
    cache_module.report_cache = None
    assert get_report_cache() is None
