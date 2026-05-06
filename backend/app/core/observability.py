"""Sentry initialization for the backend.

DSN is optional: if `SENTRY_DSN` is empty, `init_sentry()` is a no-op (logs a
warning so deployments without Sentry are visible but don't crash).
"""
from __future__ import annotations

import os
import subprocess
from typing import Optional

from app.config import settings
from app.core.logging import logger


def _resolve_release() -> Optional[str]:
    """Resolve a release identifier.

    Priority:
      1. settings.sentry_release (explicit env var)
      2. GIT_SHA / SOURCE_VERSION env vars (common in CI/CD)
      3. `git rev-parse HEAD` if available
      4. None
    """
    if settings.sentry_release:
        return settings.sentry_release
    for key in ("GIT_SHA", "SOURCE_VERSION", "GIT_COMMIT"):
        v = os.environ.get(key)
        if v:
            return v
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
        ).decode("utf-8").strip()
        return sha or None
    except Exception:  # pragma: no cover - git not available in some envs
        return None


def traces_sampler(sampling_context: dict) -> float:
    """Per-route sampling rates for Sentry tracing.

    Rules:
      - /healthz, /readyz  → 0.0  (no traces — high-frequency, low-value)
      - /api/dte/*         → 0.5  (DTE calls: important, sample half)
      - /api/lioren/*      → 0.5  (Lioren webhook/API: same)
      - everything else    → 0.05 (default 5%)
    """
    scope = sampling_context.get("asgi_scope", {})
    path = scope.get("path", "")
    if path in ("/healthz", "/readyz"):
        return 0.0
    if path.startswith("/api/dte/") or path.startswith("/api/lioren/"):
        return 0.5
    return 0.05


def init_sentry() -> bool:
    """Initialize Sentry. Returns True if init happened, False if skipped."""
    dsn = (settings.sentry_dsn or "").strip()
    if not dsn:
        logger.warning("sentry.skipped reason=empty_dsn")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:  # pragma: no cover - sentry-sdk should always be installed
        logger.warning("sentry.skipped reason=sentry_sdk_not_installed")
        return False

    profiles_sample_rate = 1.0 if settings.sentry_traces_profile else 0.0

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.sentry_env or "production",
        release=_resolve_release(),
        traces_sampler=traces_sampler,
        profiles_sample_rate=profiles_sample_rate,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        send_default_pii=False,
    )
    logger.info(
        "sentry.initialized env={env} traces=sampler profiling={profiling}",
        env=settings.sentry_env,
        profiling=settings.sentry_traces_profile,
    )
    return True


__all__ = ["init_sentry", "traces_sampler"]
