"""Per-request structured logging middleware.

Emits one log line per HTTP request with:
    request_id, user_id, route (path template), method, status, latency_ms

Lives separately from `logging.py` so the configuration entry-point stays
small and the middleware can be tested in isolation.
"""
from __future__ import annotations

import time
import uuid
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.core.logging import logger


def _extract_user_id(request: Request) -> Any:
    """Best-effort user_id extraction from the JWT in Authorization header.

    We don't want to introduce a hard dependency on auth middleware ordering
    or DB lookups for logging — decode-only, fail silent.
    """
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        # Local import to avoid circular import at module load
        from jose import jwt  # type: ignore

        from app.config import settings

        payload = jwt.decode(
            token, settings.secret_key, algorithms=["HS256"], options={"verify_exp": False}
        )
        return payload.get("sub")
    except Exception:
        return None


def _resolve_route(request: Request) -> str:
    """Return the matched route's path template, or the literal path if unmatched."""
    route = request.scope.get("route")
    if route is not None:
        # Starlette Route exposes `.path`; Mount uses `.path` too.
        path = getattr(route, "path", None)
        if path:
            return path
    return request.url.path


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """Adds request_id + structured access log to every request."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.perf_counter()
        status_code = 500
        response: Response | None = None
        exc: BaseException | None = None
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        except BaseException as e:  # noqa: BLE001 — re-raised after logging
            exc = e
            raise
        finally:
            latency_ms = round((time.perf_counter() - start) * 1000, 2)
            user_id = _extract_user_id(request)
            route = _resolve_route(request)

            log = logger.bind(
                request_id=request_id,
                user_id=user_id,
                route=route,
                method=request.method,
                status=status_code,
                latency_ms=latency_ms,
            )

            # Add request_id to the response so clients can correlate.
            if response is not None:
                response.headers["x-request-id"] = request_id

            if exc is not None:
                log.opt(exception=exc).error("request.failed")
            elif status_code >= 500:
                log.error("request.completed")
            else:
                log.info("request.completed")


def install(app: ASGIApp) -> None:
    """Attach the middleware to a FastAPI/Starlette app."""
    # Late import to avoid hard FastAPI dependency at import time
    from fastapi import FastAPI

    if isinstance(app, FastAPI):
        app.add_middleware(RequestLoggerMiddleware)


__all__ = ["RequestLoggerMiddleware", "install"]
