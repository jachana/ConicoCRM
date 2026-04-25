"""Health check endpoints (W1-06).

`/healthz` — liveness/readiness combined check used by container orchestrators
and uptime monitors. Pings Postgres and (best-effort) Redis.

`/readyz` — alias of `/healthz` for k8s convention. The intent is identical
for now; it shares the same handler so we have a single source of truth and
no copy-paste drift. We can split them later (e.g., readyz could check warm
caches) by registering separate functions if/when the semantics diverge.

These endpoints MUST NOT require auth — they are consumed by infra.

Important: the DB check uses a dedicated, short-lived engine with NullPool
and a strict connect timeout. It deliberately does NOT use the app's session
pool (`get_db`): if the pool is saturated under load, a probe that depends
on it would block past the orchestrator timeout and the container would be
killed for an unrelated load spike. Liveness/readiness must be independent
of app DB pool state.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool

from app.config import settings

router = APIRouter(tags=["health"])


def _build_health_engine() -> Engine:
    """Bare engine for probes — NullPool + tight connect timeout.

    `connect_timeout` is a libpq option honored by psycopg2 for postgres URLs;
    sqlite ignores it harmlessly. NullPool ensures we never hold connections
    between probes, so a saturated app pool can't starve the health check
    and a stuck health check can't starve the app.
    """
    connect_args: dict[str, Any] = {}
    url = settings.database_url or ""
    if not url.startswith("sqlite"):
        connect_args["connect_timeout"] = 2
    return create_engine(
        url,
        poolclass=NullPool,
        pool_pre_ping=False,
        connect_args=connect_args,
    )


# Cached at module level so we don't pay engine-construction cost per probe.
_health_engine: Engine = _build_health_engine()


def _check_db() -> dict[str, Any]:
    try:
        with _health_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
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


def _build_health_response() -> JSONResponse:
    checks = [_check_db(), _check_redis()]
    # Only "error" is fatal — "skipped" must not 503 the service.
    unhealthy = any(c["status"] == "error" for c in checks)
    body = {"status": "error" if unhealthy else "ok", "checks": checks}
    return JSONResponse(status_code=503 if unhealthy else 200, content=body)


def healthz() -> JSONResponse:
    return _build_health_response()


# Single source of truth: register the same handler under both paths.
# Keeps semantics identical without duplicating code; we can split later.
router.add_api_route("/healthz", healthz, methods=["GET"], include_in_schema=False)
router.add_api_route("/readyz", healthz, methods=["GET"], include_in_schema=False)


__all__ = ["router"]
