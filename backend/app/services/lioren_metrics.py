"""Instrumentation for Lioren API calls: latency, cost attribution, structured logging.

Each call to Lioren is wrapped with `lioren_call()` which captures endpoint, method,
latency_ms, http_status, request/response sizes, empresa_id, dte_tipo, and estimated
cost in CLP (looked up from the `cost_tariff` table by dte_tipo slug).

Log line key: "lioren.call" at INFO level. All fields land in the loguru extras dict,
which in prod (JSON mode) appears as structured JSON fields.
"""
from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Generator

from app.core.logging import logger

# Maps DTE tipo codes and libro tipos to cost_tariff slugs.
_TIPO_TO_SLUG: dict[str, str] = {
    "033": "factura_emision",
    "034": "factura_exenta",
    "039": "boleta",
    "041": "boleta_exenta",
    "046": "factura_compra",
    "052": "guia_despacho",
    "056": "nota_debito",
    "061": "nota_credito",
    "ventas": "libro_envio",
    "compras": "libro_envio",
}


@contextmanager
def lioren_call(
    endpoint: str,
    method: str,
    *,
    empresa_id: int | None = None,
    dte_tipo: str | None = None,
    db=None,
    req_size: int = 0,
) -> Generator[dict, None, None]:
    """Context manager that times a Lioren HTTP call and emits a structured log line.

    Usage:
        with lioren_call(url, "POST", empresa_id=1, dte_tipo="033", db=db, req_size=len(body)) as state:
            resp = httpx.post(url, ...)
            state["status"] = resp.status_code
            state["resp_size"] = len(resp.content)

    The `state` dict is populated by the caller inside the block. On exit,
    latency_ms and cost_clp are computed and a "lioren.call" log line is emitted.
    """
    state: dict = {}
    t0 = time.perf_counter()
    try:
        yield state
    finally:
        latency_ms = round((time.perf_counter() - t0) * 1000)
        slug = _TIPO_TO_SLUG.get(dte_tipo or "") if dte_tipo else None
        cost_clp = _lookup_cost(db, slug) if db is not None and slug else 0
        logger.bind(
            endpoint=endpoint,
            method=method,
            latency_ms=latency_ms,
            http_status=state.get("status"),
            req_size=req_size,
            resp_size=state.get("resp_size", 0),
            empresa_id=empresa_id,
            dte_tipo=dte_tipo,
            cost_clp=cost_clp,
        ).info("lioren.call")
        try:
            from app.core.request_logger import _get_redis as _get_perf_redis
            import json as _json
            import time as _time
            _r = _get_perf_redis()
            if _r is not None:
                _r.rpush("conico:cost_events", _json.dumps({
                    "ts": int(_time.time()),
                    "empresa_id": empresa_id,
                    "cost_clp": cost_clp,
                }))
        except Exception:
            pass


def _lookup_cost(db, slug: str) -> int:
    from app.models.cost_tariff import CostTariff  # lazy import to avoid circular

    row = db.query(CostTariff).filter_by(slug=slug).first()
    return row.costo_clp if row else 0
