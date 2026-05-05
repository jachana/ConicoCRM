"""Tests for RequestLoggerMiddleware enhancements (T1.1).

Covers: empresa_id extraction, query_count tracking, response_size capture.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.request_logger import (
    RequestLoggerMiddleware,
    _extract_empresa_id,
    _extract_user_id,
    _query_count,
)
from app.core.security import create_access_token


# ---------------------------------------------------------------------------
# Minimal test app
# ---------------------------------------------------------------------------

def _make_app(response_body: dict | None = None, status: int = 200) -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestLoggerMiddleware)

    @app.get("/test")
    def _endpoint():
        return JSONResponse(response_body or {"ok": True}, status_code=status)

    return app


# ---------------------------------------------------------------------------
# _extract_empresa_id unit tests
# ---------------------------------------------------------------------------

def _mock_request(token: str | None = None) -> Request:
    """Build a minimal mock Starlette Request with optional Bearer token."""
    headers = {}
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = MagicMock(spec=Request)
    req.headers = headers
    req.state = MagicMock()
    # Simulate no user loaded in state.
    req.state.current_user = None
    del req.state.user  # AttributeError = not present
    return req


def test_extract_empresa_id_from_jwt_claim():
    """empresa_id claim in JWT is extracted without DB hit."""
    token = create_access_token({"sub": "user@test.com", "empresa_id": "42"})
    req = _mock_request(token)
    assert _extract_empresa_id(req) == "42"


def test_extract_empresa_id_anonymous_returns_none():
    """Anonymous request (no Authorization header) returns None."""
    req = _mock_request(token=None)
    assert _extract_empresa_id(req) is None


def test_extract_empresa_id_jwt_without_claim_returns_none():
    """JWT without empresa_id claim returns None, not an error."""
    token = create_access_token({"sub": "user@test.com"})
    req = _mock_request(token)
    assert _extract_empresa_id(req) is None


def test_extract_empresa_id_from_state_user():
    """empresa_id is read from request.state.current_user when already loaded."""
    req = MagicMock(spec=Request)
    req.headers = {}
    user = MagicMock()
    user.empresa_id = 99
    req.state = MagicMock()
    req.state.current_user = user
    assert _extract_empresa_id(req) == 99


# ---------------------------------------------------------------------------
# Middleware integration tests (via TestClient)
# ---------------------------------------------------------------------------

def test_middleware_logs_empresa_id(caplog):
    """empresa_id appears in the structured log for an authenticated request."""
    token = create_access_token({"sub": "u@x.com", "empresa_id": "7"})
    app = _make_app()
    log_records: list[dict] = []

    with patch("app.core.request_logger.logger") as mock_log:
        bound = MagicMock()
        mock_log.bind.return_value = bound
        with TestClient(app, raise_server_exceptions=False) as client:
            client.get("/test", headers={"Authorization": f"Bearer {token}"})

        call_kwargs = mock_log.bind.call_args.kwargs
        assert call_kwargs.get("empresa_id") == "7"


def test_middleware_empresa_id_null_for_anonymous():
    """empresa_id is None in the log for unauthenticated requests."""
    app = _make_app()
    with patch("app.core.request_logger.logger") as mock_log:
        bound = MagicMock()
        mock_log.bind.return_value = bound
        with TestClient(app, raise_server_exceptions=False) as client:
            client.get("/test")

        call_kwargs = mock_log.bind.call_args.kwargs
        assert call_kwargs.get("empresa_id") is None


def test_middleware_response_size_captured():
    """response_size is extracted from Content-Length header when present."""
    app = _make_app({"hello": "world"})
    with patch("app.core.request_logger.logger") as mock_log:
        bound = MagicMock()
        mock_log.bind.return_value = bound
        with TestClient(app, raise_server_exceptions=False) as client:
            client.get("/test")

        call_kwargs = mock_log.bind.call_args.kwargs
        # response_size may be None if TestClient doesn't set Content-Length,
        # but it must always be present as a key in the log call.
        assert "response_size" in call_kwargs


def test_middleware_query_count_in_log():
    """query_count key is always present in the structured log."""
    app = _make_app()
    with patch("app.core.request_logger.logger") as mock_log:
        bound = MagicMock()
        mock_log.bind.return_value = bound
        with TestClient(app, raise_server_exceptions=False) as client:
            client.get("/test")

        call_kwargs = mock_log.bind.call_args.kwargs
        assert "query_count" in call_kwargs
        assert isinstance(call_kwargs["query_count"], int)


def test_query_count_reflects_db_queries():
    """query_count increments when SQLAlchemy executes a query within a request context."""
    from app.core.request_logger import _install_query_counter, _query_count
    import app.database as db_mod
    from sqlalchemy import text

    # Ensure the counter listener is installed (idempotent).
    _install_query_counter()

    engine = db_mod.engine
    token = _query_count.set(0)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        assert _query_count.get() >= 1, "query_count should increment for each SQL execute"
    finally:
        _query_count.reset(token)
