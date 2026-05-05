"""Unit tests for health check endpoints.

All external calls (_check_db, _check_redis, _check_celery, _check_lioren)
are patched so no real network or DB connections are made.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# /health/live — pure liveness probe, never calls external services
# ---------------------------------------------------------------------------

def test_live_always_200():
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_live_returns_200_regardless_of_db():
    """Even if DB is down, /health/live must return 200."""
    with patch("app.api.health._check_db", side_effect=Exception("db down")):
        response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "alive"


# ---------------------------------------------------------------------------
# /health/full — comprehensive check
# ---------------------------------------------------------------------------

_OK_DB = {"name": "db", "status": "ok", "latency_ms": 1.0}
_OK_REDIS = {"name": "redis", "status": "ok", "latency_ms": 1.0}
_OK_CELERY = {"name": "celery", "status": "ok", "latency_ms": 1.0}
_OK_LIOREN = {"name": "lioren", "status": "ok", "latency_ms": 1.0}

_ERR_DB = {"name": "db", "status": "error", "latency_ms": 1.0, "error": "connection refused"}
_ERR_REDIS = {"name": "redis", "status": "error", "latency_ms": 1.0, "error": "timeout"}
_ERR_CELERY = {"name": "celery", "status": "error", "latency_ms": 1.0, "error": "no workers responded"}
_ERR_LIOREN = {"name": "lioren", "status": "error", "latency_ms": 1.0, "error": "connection error"}

_SKIP_REDIS = {"name": "redis", "status": "skipped", "latency_ms": 0.0, "reason": "not_configured"}
_SKIP_CELERY = {"name": "celery", "status": "skipped", "latency_ms": 0.0, "reason": "redis_not_configured"}
_SKIP_LIOREN = {"name": "lioren", "status": "skipped", "latency_ms": 0.0, "reason": "not_configured"}


def _patch_all(db=_OK_DB, redis=_OK_REDIS, celery=_OK_CELERY, lioren=_OK_LIOREN):
    """Context manager that patches all four check functions."""
    return (
        patch("app.api.health._check_db", return_value=db),
        patch("app.api.health._check_redis", return_value=redis),
        patch("app.api.health._check_celery", return_value=celery),
        patch("app.api.health._check_lioren", return_value=lioren),
    )


def test_full_all_ok():
    with (
        patch("app.api.health._check_db", return_value=_OK_DB),
        patch("app.api.health._check_redis", return_value=_OK_REDIS),
        patch("app.api.health._check_celery", return_value=_OK_CELERY),
        patch("app.api.health._check_lioren", return_value=_OK_LIOREN),
    ):
        response = client.get("/health/full")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    names = {c["name"] for c in body["checks"]}
    assert names == {"db", "redis", "celery", "lioren"}


def test_full_503_when_db_error():
    with (
        patch("app.api.health._check_db", return_value=_ERR_DB),
        patch("app.api.health._check_redis", return_value=_OK_REDIS),
        patch("app.api.health._check_celery", return_value=_OK_CELERY),
        patch("app.api.health._check_lioren", return_value=_OK_LIOREN),
    ):
        response = client.get("/health/full")

    assert response.status_code == 503
    assert response.json()["status"] == "error"


def test_full_503_when_redis_error():
    with (
        patch("app.api.health._check_db", return_value=_OK_DB),
        patch("app.api.health._check_redis", return_value=_ERR_REDIS),
        patch("app.api.health._check_celery", return_value=_OK_CELERY),
        patch("app.api.health._check_lioren", return_value=_OK_LIOREN),
    ):
        response = client.get("/health/full")

    assert response.status_code == 503
    assert response.json()["status"] == "error"


def test_full_503_when_celery_error():
    with (
        patch("app.api.health._check_db", return_value=_OK_DB),
        patch("app.api.health._check_redis", return_value=_OK_REDIS),
        patch("app.api.health._check_celery", return_value=_ERR_CELERY),
        patch("app.api.health._check_lioren", return_value=_OK_LIOREN),
    ):
        response = client.get("/health/full")

    assert response.status_code == 503
    assert response.json()["status"] == "error"


def test_full_503_when_lioren_error():
    with (
        patch("app.api.health._check_db", return_value=_OK_DB),
        patch("app.api.health._check_redis", return_value=_OK_REDIS),
        patch("app.api.health._check_celery", return_value=_OK_CELERY),
        patch("app.api.health._check_lioren", return_value=_ERR_LIOREN),
    ):
        response = client.get("/health/full")

    assert response.status_code == 503
    assert response.json()["status"] == "error"


def test_full_200_when_skipped_checks():
    """Skipped subchecks (not configured) must not cause 503."""
    with (
        patch("app.api.health._check_db", return_value=_OK_DB),
        patch("app.api.health._check_redis", return_value=_SKIP_REDIS),
        patch("app.api.health._check_celery", return_value=_SKIP_CELERY),
        patch("app.api.health._check_lioren", return_value=_SKIP_LIOREN),
    ):
        response = client.get("/health/full")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    statuses = {c["name"]: c["status"] for c in body["checks"]}
    assert statuses["db"] == "ok"
    assert statuses["redis"] == "skipped"
    assert statuses["celery"] == "skipped"
    assert statuses["lioren"] == "skipped"


def test_full_checks_contain_latency():
    """Every subcheck result must include a latency_ms field."""
    with (
        patch("app.api.health._check_db", return_value=_OK_DB),
        patch("app.api.health._check_redis", return_value=_OK_REDIS),
        patch("app.api.health._check_celery", return_value=_OK_CELERY),
        patch("app.api.health._check_lioren", return_value=_OK_LIOREN),
    ):
        response = client.get("/health/full")

    body = response.json()
    for check in body["checks"]:
        assert "latency_ms" in check, f"latency_ms missing from {check['name']}"


# ---------------------------------------------------------------------------
# /healthz and /readyz — backward compat aliases
# ---------------------------------------------------------------------------

def test_healthz_backward_compat():
    with (
        patch("app.api.health._check_db", return_value=_OK_DB),
        patch("app.api.health._check_redis", return_value=_OK_REDIS),
        patch("app.api.health._check_celery", return_value=_OK_CELERY),
        patch("app.api.health._check_lioren", return_value=_OK_LIOREN),
    ):
        response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_readyz_backward_compat():
    with (
        patch("app.api.health._check_db", return_value=_OK_DB),
        patch("app.api.health._check_redis", return_value=_OK_REDIS),
        patch("app.api.health._check_celery", return_value=_OK_CELERY),
        patch("app.api.health._check_lioren", return_value=_OK_LIOREN),
    ):
        response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_healthz_503_on_error():
    with (
        patch("app.api.health._check_db", return_value=_ERR_DB),
        patch("app.api.health._check_redis", return_value=_OK_REDIS),
        patch("app.api.health._check_celery", return_value=_OK_CELERY),
        patch("app.api.health._check_lioren", return_value=_OK_LIOREN),
    ):
        response = client.get("/healthz")
    assert response.status_code == 503
    assert response.json()["status"] == "error"
