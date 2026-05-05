"""Health check endpoints (W1-06).

`/healthz` — liveness/readiness combined check used by container orchestrators
and uptime monitors. Pings Postgres and (best-effort) Redis.

`/readyz` — alias of `/healthz` for k8s convention. The intent is identical
for now; it shares the same handler so we have a single source of truth and
no copy-paste drift. We can split them later (e.g., readyz could check warm
caches) by registering separate functions if/when the semantics diverge.

`/health/live` — always-200 liveness probe (no external calls).

`/health/full` — comprehensive check: DB, Redis, Celery, Lioren.
              Returns 200 if all ok/skipped, 503 if any "error".

These endpoints MUST NOT require auth — they are consumed by infra.

Important: the DB check uses a dedicated, short-lived engine with NullPool
and a strict connect timeout. It deliberately does NOT use the app's session
pool (`get_db`): if the pool is saturated under load, a probe that depends
on it would block past the orchestrator timeout and the container would be
killed for an unrelated load spike. Liveness/readiness must be independent
of app DB pool state.
"""
from __future__ import annotations

import time
from typing import Any

import httpx
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
    t0 = time.perf_counter()
    try:
        with _health_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"name": "db", "status": "ok", "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"name": "db", "status": "error", "latency_ms": latency_ms, "error": str(e)[:200]}


def _check_redis() -> dict[str, Any]:
    url = (settings.redis_url or "").strip()
    if not url:
        return {"name": "redis", "status": "skipped", "latency_ms": 0.0, "reason": "not_configured"}
    t0 = time.perf_counter()
    try:
        import redis  # type: ignore

        # Tight timeouts: health endpoints must respond fast even when Redis
        # is unreachable. We treat connection failures as 'error' (the
        # endpoint returns 503), but never block longer than ~1.5s total.
        client = redis.Redis.from_url(
            url, socket_connect_timeout=1, socket_timeout=1
        )
        client.ping()
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"name": "redis", "status": "ok", "latency_ms": latency_ms}
    except ImportError:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"name": "redis", "status": "skipped", "latency_ms": latency_ms, "reason": "redis_pkg_missing"}
    except Exception as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"name": "redis", "status": "error", "latency_ms": latency_ms, "error": str(e)[:200]}


def _check_celery() -> dict[str, Any]:
    url = (settings.redis_url or "").strip()
    if not url:
        return {"name": "celery", "status": "skipped", "latency_ms": 0.0, "reason": "redis_not_configured"}
    t0 = time.perf_counter()
    try:
        from app.celery_app import celery_app  # local import to avoid circular deps

        result = celery_app.control.ping(timeout=3)
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        if not result:
            return {"name": "celery", "status": "error", "latency_ms": latency_ms, "error": "no workers responded"}
        return {"name": "celery", "status": "ok", "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"name": "celery", "status": "error", "latency_ms": latency_ms, "error": str(e)[:200]}


def _check_lioren() -> dict[str, Any]:
    api_key = (settings.lioren_api_key or "").strip()
    if not api_key:
        return {"name": "lioren", "status": "skipped", "latency_ms": 0.0, "reason": "not_configured"}
    t0 = time.perf_counter()
    try:
        url = settings.lioren_api_url or "https://api.lioren.cl/v1"
        response = httpx.get(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5.0,
        )
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        # Any HTTP response (even 4xx) means the service is reachable
        return {"name": "lioren", "status": "ok", "latency_ms": latency_ms}
    except httpx.ConnectError as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"name": "lioren", "status": "error", "latency_ms": latency_ms, "error": str(e)[:200]}
    except Exception as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {"name": "lioren", "status": "error", "latency_ms": latency_ms, "error": str(e)[:200]}


def _build_health_response() -> JSONResponse:
    checks = [_check_db(), _check_redis(), _check_celery(), _check_lioren()]
    # Only "error" is fatal — "skipped" must not 503 the service.
    unhealthy = any(c["status"] == "error" for c in checks)
    body = {"status": "error" if unhealthy else "ok", "checks": checks}
    return JSONResponse(status_code=503 if unhealthy else 200, content=body)


def healthz() -> JSONResponse:
    return _build_health_response()


def health_live() -> JSONResponse:
    """Liveness probe — always returns 200. No external checks."""
    return JSONResponse(status_code=200, content={"status": "alive"})


def health_full() -> JSONResponse:
    """Full health check: DB, Redis, Celery, Lioren."""
    return _build_health_response()


# Single source of truth: register the same handler under both legacy paths.
router.add_api_route("/healthz", healthz, methods=["GET"], include_in_schema=False)
router.add_api_route("/readyz", healthz, methods=["GET"], include_in_schema=False)

# New structured endpoints
router.add_api_route("/health/live", health_live, methods=["GET"], include_in_schema=True)
router.add_api_route("/health/full", health_full, methods=["GET"], include_in_schema=True)


__all__ = ["router"]
