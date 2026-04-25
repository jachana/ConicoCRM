"""Middleware que extrae user_id, IP y user-agent del request y los expone
vía `contextvars` para que los listeners de SQLAlchemy puedan estamparlos
en cada AuditLog creado durante la request.

Diseño:
- Una única `ContextVar` con un dict (user_id, ip, user_agent).
- El middleware setea el var al entrar al request y lo resetea al salir.
- Los listeners de auditoría leen el var; si está vacío, los logs salen
  con `user_id=None` (eventos sistema / unauthenticated).
"""
from __future__ import annotations

from contextvars import ContextVar
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.security import decode_token


_audit_context: ContextVar[dict] = ContextVar("audit_context", default={})


def get_audit_context() -> dict:
    return _audit_context.get() or {}


def _resolve_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip() or None
    if request.client and request.client.host:
        return request.client.host
    return None


def _resolve_user_id(request: Request) -> int | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    # Lookup perezoso email → user_id usando una sesión efímera.
    try:
        from app.database import SessionLocal
        from app.models.user import User
        with SessionLocal() as s:
            u = s.query(User).filter_by(email=sub).first()
            return u.id if u else None
    except Exception:
        return None


_MUTATING_METHODS = {"POST", "PATCH", "PUT", "DELETE"}


class AuditContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method not in _MUTATING_METHODS:
            return await call_next(request)

        ctx = {
            "user_id": _resolve_user_id(request),
            "ip": _resolve_ip(request),
            "user_agent": (request.headers.get("user-agent") or "")[:500] or None,
        }
        token = _audit_context.set(ctx)
        try:
            return await call_next(request)
        finally:
            _audit_context.reset(token)
