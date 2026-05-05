"""Per-request structured logging middleware.

Emits one log line per HTTP request with:
    request_id, user_id, empresa_id, route, method, status,
    latency_ms, query_count, response_size
"""
from __future__ import annotations

import time
import uuid
from contextvars import ContextVar
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.config import settings
from app.core.logging import logger
from app.core import db_metrics as _db_metrics

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            import redis as _redis_lib
            _redis_client = _redis_lib.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=0.5)
        except Exception:
            pass
    return _redis_client

try:
    from jose import jwt as _jwt  # type: ignore
except ImportError:  # pragma: no cover
    _jwt = None  # type: ignore[assignment]

# Per-request SQL query counter (ContextVar so it's scoped to the current asyncio task).
_query_count: ContextVar[int] = ContextVar("_query_count", default=0)
_query_counter_installed = False


def _install_query_counter() -> None:
    """Register a SQLAlchemy before_cursor_execute listener to count queries per request.

    Called lazily on first dispatch to avoid circular imports at module load time.
    Guarded by a module-level flag so the listener is registered exactly once.
    """
    global _query_counter_installed
    if _query_counter_installed:
        return
    _query_counter_installed = True  # Set before import so errors don't cause infinite retry.
    try:
        from app.database import engine
        from sqlalchemy import event as sa_event

        @sa_event.listens_for(engine, "before_cursor_execute")
        def _on_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            _query_count.set(_query_count.get() + 1)
    except Exception:
        pass


def _extract_user_id(request: Request) -> Any:
    """Best-effort user_id from JWT sub claim. Decode-only, no DB hit."""
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token or _jwt is None:
        return None
    try:
        from app.config import settings

        payload = _jwt.decode(
            token, settings.secret_key, algorithms=["HS256"], options={"verify_exp": False}
        )
        return payload.get("sub")
    except Exception:
        return None


def _extract_empresa_id(request: Request) -> Any:
    """Best-effort empresa_id from JWT claim or request.state user. No DB hit."""
    # Fast path: user already loaded into request.state by some upstream middleware.
    for attr in ("current_user", "user"):
        user = getattr(request.state, attr, None)
        if user is not None and hasattr(user, "empresa_id"):
            return user.empresa_id

    # JWT claim path.
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token or _jwt is None:
        return None
    try:
        from app.config import settings

        payload = _jwt.decode(
            token, settings.secret_key, algorithms=["HS256"], options={"verify_exp": False}
        )
        return payload.get("empresa_id")
    except Exception:
        return None


def _resolve_route(request: Request) -> str:
    """Return the matched route's path template, or the literal path if unmatched."""
    route = request.scope.get("route")
    if route is not None:
        path = getattr(route, "path", None)
        if path:
            return path
    return request.url.path


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """Adds request_id + structured access log to every request."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        _install_query_counter()

        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id

        # Propagate request_id to db_metrics slow-query listener.
        rid_token = _db_metrics.current_request_id.set(request_id)

        # Reset per-request query counter.
        query_token = _query_count.set(0)

        start = time.perf_counter()
        status_code = 500
        response: Response | None = None
        exc: BaseException | None = None
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except BaseException as e:  # noqa: BLE001
            exc = e
            raise
        finally:
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            query_count_val = _query_count.get()
            _query_count.reset(query_token)
            _db_metrics.current_request_id.reset(rid_token)

            user_id = _extract_user_id(request)
            empresa_id = _extract_empresa_id(request)
            route = _resolve_route(request)

            response_size: int | None = None
            if response is not None:
                cl = response.headers.get("content-length")
                if cl:
                    try:
                        response_size = int(cl)
                    except (ValueError, TypeError):
                        pass

            log = logger.bind(
                request_id=request_id,
                user_id=user_id,
                empresa_id=empresa_id,
                route=route,
                method=request.method,
                status=status_code,
                latency_ms=latency_ms,
                query_count=query_count_val,
                response_size=response_size,
            )

            if response is not None:
                response.headers["x-request-id"] = request_id

            if exc is not None:
                log.opt(exception=exc).error("request.failed")
            elif status_code >= 500:
                log.error("request.completed")
            else:
                log.info("request.completed")

            # Push telemetry event to Redis for T2.1 aggregation
            try:
                import json as _json
                _r = _get_redis()
                if _r is not None:
                    _r.rpush("conico:perf_events", _json.dumps({
                        "ts": int(time.time()),
                        "route": route,
                        "empresa_id": empresa_id,
                        "latency_ms": latency_ms,
                        "status": status_code,
                        "queries": query_count_val,
                    }))
            except Exception:
                pass  # never fail a request because of telemetry


def install(app: ASGIApp) -> None:
    """Attach the middleware to a FastAPI/Starlette app."""
    from fastapi import FastAPI

    if isinstance(app, FastAPI):
        app.add_middleware(RequestLoggerMiddleware)


__all__ = ["RequestLoggerMiddleware", "install", "_get_redis"]
