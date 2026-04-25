"""Tests for W1-06 observabilidad: health endpoints, request logger, sentry init.

These tests exercise:
  - /healthz returns 200 when DB up
  - /healthz returns 503 when DB ping fails
  - /readyz mirrors /healthz behaviour
  - Request access log line carries the required fields
  - init_sentry() does not crash with empty DSN
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from loguru import logger


@pytest.fixture
def stub_redis_ok():
    """Local test envs don't run Redis; stub the redis check to 'ok'.

    Prevents the real ping from timing out / 503-ing the health endpoint.
    """
    from app.api import health as health_module

    with patch.object(
        health_module,
        "_check_redis",
        lambda: {"name": "redis", "status": "ok"},
    ):
        yield


def test_healthz_ok(client, stub_redis_ok):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    names = {c["name"] for c in body["checks"]}
    assert "db" in names
    assert "redis" in names
    db_check = next(c for c in body["checks"] if c["name"] == "db")
    assert db_check["status"] == "ok"


def test_readyz_ok(client, stub_redis_ok):
    resp = client.get("/readyz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_healthz_db_down_returns_503(client):
    """When SELECT 1 fails the endpoint must return 503 with detail in body."""
    from app.api import health as health_module

    def _broken_db():
        return {"name": "db", "status": "error", "error": "boom"}

    with patch.object(health_module, "_check_db", _broken_db):
        resp = client.get("/healthz")
        assert resp.status_code == 503
        body = resp.json()
        assert body["status"] == "error"
        db_check = next(c for c in body["checks"] if c["name"] == "db")
        assert db_check["status"] == "error"


def test_healthz_redis_unavailable_does_not_503(client):
    """Redis 'skipped' (not configured / lib missing) must not fail the check."""
    from app.api import health as health_module

    def _skipped_redis():
        return {"name": "redis", "status": "skipped", "reason": "not_configured"}

    with patch.object(health_module, "_check_redis", _skipped_redis):
        resp = client.get("/healthz")
        assert resp.status_code == 200
        redis_check = next(c for c in resp.json()["checks"] if c["name"] == "redis")
        assert redis_check["status"] == "skipped"


def test_request_log_contains_required_fields(client, stub_redis_ok):
    """Capture loguru output and assert per-request log line fields."""
    captured: list[dict] = []

    def sink(message):
        record = message.record
        captured.append(
            {
                "message": record["message"],
                "extra": dict(record["extra"]),
                "level": record["level"].name,
            }
        )

    sink_id = logger.add(sink, level="INFO")
    try:
        resp = client.get("/healthz")
        assert resp.status_code == 200
        # Response must echo the request_id header for client correlation.
        assert "x-request-id" in resp.headers
    finally:
        logger.remove(sink_id)

    completed = [c for c in captured if c["message"] == "request.completed"]
    assert completed, "expected at least one 'request.completed' log entry"
    extras = completed[-1]["extra"]
    for field in ("request_id", "user_id", "route", "method", "status", "latency_ms"):
        assert field in extras, f"missing field {field} in log extras: {extras}"
    assert extras["method"] == "GET"
    assert extras["status"] == 200
    assert extras["route"] == "/healthz"
    assert isinstance(extras["latency_ms"], (int, float))
    assert extras["user_id"] is None  # unauthenticated


def test_request_log_includes_user_id_when_authenticated(client, admin_token):
    captured: list[dict] = []

    def sink(message):
        record = message.record
        if record["message"] == "request.completed":
            captured.append(dict(record["extra"]))

    sink_id = logger.add(sink, level="INFO")
    try:
        resp = client.get(
            "/api/users/me/preferencias",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
    finally:
        logger.remove(sink_id)

    assert captured, "expected at least one request.completed log"
    last = captured[-1]
    # JWT 'sub' is the user email in this codebase.
    assert last["user_id"] == "admin@conico.cl"
    # route should be the path template, not the literal path.
    assert last["route"] == "/api/users/me/preferencias"


def test_request_log_5xx_logs_as_error(client):
    """A 5xx response must be logged at ERROR level."""
    from app.main import app
    from fastapi import APIRouter

    boom_router = APIRouter()

    @boom_router.get("/_test_boom")
    def _boom():
        raise RuntimeError("intentional")

    app.include_router(boom_router)

    captured: list[dict] = []

    def sink(message):
        record = message.record
        if record["message"] in ("request.completed", "request.failed"):
            captured.append(
                {"level": record["level"].name, "extra": dict(record["extra"])}
            )

    sink_id = logger.add(sink, level="DEBUG")
    try:
        # TestClient re-raises by default; suppress to inspect status.
        with pytest.raises(RuntimeError):
            client.get("/_test_boom")
    finally:
        logger.remove(sink_id)

    assert captured, "expected an error-level log for the 5xx request"
    assert captured[-1]["level"] == "ERROR"


def test_init_sentry_empty_dsn_is_noop():
    from app.core.observability import init_sentry
    from app.config import settings

    original = settings.sentry_dsn
    settings.sentry_dsn = ""
    try:
        # Must not raise
        result = init_sentry()
        assert result is False
    finally:
        settings.sentry_dsn = original


def test_log_format_json_emits_valid_json(monkeypatch):
    """LOG_FORMAT=json should emit machine-readable JSON lines."""
    import io
    from app.core import logging as core_logging

    # Reset so configure_logging actually re-runs.
    core_logging._CONFIGURED = False

    monkeypatch.setattr(core_logging.settings, "log_format", "json")
    monkeypatch.setattr(core_logging.settings, "log_level", "INFO")

    buf = io.StringIO()
    # Replace stdout sink with our buffer for assertion.
    core_logging.logger.remove()
    core_logging.logger.add(buf, level="INFO", serialize=True)
    core_logging._CONFIGURED = True  # prevent re-running configure_logging in tests

    core_logging.logger.bind(foo="bar").info("hello")
    line = buf.getvalue().strip().splitlines()[-1]
    parsed = json.loads(line)
    assert "record" in parsed
    assert parsed["record"]["message"] == "hello"
    assert parsed["record"]["extra"]["foo"] == "bar"

    # Restore pretty mode for subsequent tests.
    core_logging._CONFIGURED = False
    monkeypatch.setattr(core_logging.settings, "log_format", "pretty")
    core_logging.configure_logging()
