"""Health check endpoints (W1-06).

`/healthz` — liveness/readiness combined check used by container orchestrators
and uptime monitors. Pings Postgres and (best-effort) Redis.

`/readyz` — alias of `/healthz` for k8s convention. The intent is identical
for now; we keep them as separate handlers so we can diverge later
(e.g., readyz could check warm caches) without breaking callers.

These endpoints MUST NOT require auth — they are consumed by infra.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db

router = APIRouter(tags=["health"])


def _check_db(db: Session) -> dict[str, Any]:
    try:
        db.execute(text("SELECT 1"))
        return {"name": "db", "status": "ok"}
    except Exception as e:
        return {"name": "db", "status": "error", "error": str(e)[:200]}


def _check_redis() -> dict[str, Any]:
    url = (settings.redis_url or "").strip()
    if not url:
        return {"name": "redis", "status": "skipped", "reason": "not_configured"}
    try:
        import redis  # type: ignore

        # Tight timeouts: health endpoints must respond fast even when Redis
        # is unreachable. We treat connection failures as 'error' (the
        # endpoint returns 503), but never block longer than ~1.5s total.
        client = redis.Redis.from_url(
            url, socket_connect_timeout=1, socket_timeout=1
        )
        client.ping()
        return {"name": "redis", "status": "ok"}
    except ImportError:
        return {"name": "redis", "status": "skipped", "reason": "redis_pkg_missing"}
    except Exception as e:
        return {"name": "redis", "status": "error", "error": str(e)[:200]}


def _build_health_response(db: Session) -> JSONResponse:
    checks = [_check_db(db), _check_redis()]
    # Only "error" is fatal — "skipped" must not 503 the service.
    unhealthy = any(c["status"] == "error" for c in checks)
    body = {"status": "error" if unhealthy else "ok", "checks": checks}
    return JSONResponse(status_code=503 if unhealthy else 200, content=body)


@router.get("/healthz", include_in_schema=False)
def healthz(db: Session = Depends(get_db)) -> JSONResponse:
    return _build_health_response(db)


@router.get("/readyz", include_in_schema=False)
def readyz(db: Session = Depends(get_db)) -> JSONResponse:
    return _build_health_response(db)


__all__ = ["router"]
