"""Structured logging setup using loguru.

W1-06 Observabilidad: configures loguru to emit JSON logs in prod and
human-readable logs in dev, controlled by `LOG_FORMAT` env var.

Use `from app.core.logging import logger` to get the configured loguru logger.
"""
from __future__ import annotations

import logging
import sys

from loguru import logger

from app.config import settings

_CONFIGURED = False


class InterceptHandler(logging.Handler):
    """Route stdlib logging (uvicorn, sqlalchemy, etc.) through loguru."""

    def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover - thin shim
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno
        # Find the caller from the stdlib logging frame
        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def configure_logging() -> None:
    """Configure loguru sinks based on settings. Idempotent."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    logger.remove()

    log_format = (settings.log_format or "pretty").lower()
    log_level = (settings.log_level or "INFO").upper()

    if log_format == "json":
        # serialize=True emits one JSON object per line with extras under "record".
        logger.add(
            sys.stdout,
            level=log_level,
            serialize=True,
            backtrace=False,
            diagnose=False,
            enqueue=False,
        )
    else:
        logger.add(
            sys.stdout,
            level=log_level,
            colorize=True,
            backtrace=False,
            diagnose=False,
            format=(
                "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> "
                "<level>{level: <8}</level> "
                "<cyan>{name}</cyan> - <level>{message}</level> "
                "<dim>{extra}</dim>"
            ),
        )

    # Bridge stdlib logging -> loguru so uvicorn / sqlalchemy logs are
    # emitted in our chosen format.
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
        lg = logging.getLogger(name)
        lg.handlers = [InterceptHandler()]
        lg.propagate = False

    _CONFIGURED = True


__all__ = ["configure_logging", "logger"]
