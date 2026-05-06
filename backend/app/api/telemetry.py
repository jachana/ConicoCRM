"""Admin telemetry endpoints (T2.2+)."""
from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.api.deps import require_admin
from app.models.dte_emision import DteEmision
from app.models.factura import Factura
from app.models.telemetry import CostRollup, PerfRollup
from app.models.user import User

router = APIRouter()

_EXCLUDED_ROUTES = frozenset({"healthz", "readyz", "/healthz", "/readyz"})
_STATIC_PREFIX = "/static"


class TrendBucket(BaseModel):
    hour: datetime
    p95: float
    count: int


class RouteMetrics(BaseModel):
    route: str
    count: int
    p50: float
    p95: float
    p99: float
    error_rate: float
    trend: list[TrendBucket]


class RouteMetricsResponse(BaseModel):
    period: str
    routes: list[RouteMetrics]


def _since(period: str) -> datetime:
    now = datetime.now(timezone.utc)
    if period == "24h":
        return now - timedelta(hours=24)
    if period == "7d":
        return now - timedelta(days=7)
    return now - timedelta(days=30)


@router.get("/admin/telemetry/routes", response_model=RouteMetricsResponse, tags=["telemetry"])
def get_telemetry_routes(
    period: Literal["24h", "7d", "30d"] = Query("24h"),
    empresa_id: int | None = Query(None),
    order_by: Literal["p95", "count", "error_rate"] = Query("p95"),
    limit: int = Query(20, ge=1, le=100),
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    since = _since(period)

    p50_expr = func.sum(PerfRollup.p50_ms * PerfRollup.count) / func.nullif(func.sum(PerfRollup.count), 0)
    p95_expr = func.sum(PerfRollup.p95_ms * PerfRollup.count) / func.nullif(func.sum(PerfRollup.count), 0)
    p99_expr = func.sum(PerfRollup.p99_ms * PerfRollup.count) / func.nullif(func.sum(PerfRollup.count), 0)

    q = (
        db.query(
            PerfRollup.route,
            func.sum(PerfRollup.count).label("total_count"),
            func.sum(PerfRollup.errors).label("total_errors"),
            p50_expr.label("p50"),
            p95_expr.label("p95"),
            p99_expr.label("p99"),
        )
        .filter(PerfRollup.hour >= since)
        .filter(~PerfRollup.route.in_(_EXCLUDED_ROUTES))
        .filter(~PerfRollup.route.like(f"{_STATIC_PREFIX}%"))
    )

    if empresa_id is not None:
        q = q.filter(PerfRollup.empresa_id == empresa_id)

    q = q.group_by(PerfRollup.route)

    if order_by == "p95":
        q = q.order_by(p95_expr.desc())
    elif order_by == "count":
        q = q.order_by(func.sum(PerfRollup.count).desc())
    else:
        err_expr = func.sum(PerfRollup.errors) / func.nullif(func.sum(PerfRollup.count), 0)
        q = q.order_by(err_expr.desc())

    rows = q.limit(limit).all()

    if not rows:
        return RouteMetricsResponse(period=period, routes=[])

    route_names = [r.route for r in rows]

    trend_q = (
        db.query(PerfRollup.route, PerfRollup.hour, PerfRollup.p95_ms, PerfRollup.count)
        .filter(PerfRollup.hour >= since)
        .filter(PerfRollup.route.in_(route_names))
        .order_by(PerfRollup.route, PerfRollup.hour)
    )
    if empresa_id is not None:
        trend_q = trend_q.filter(PerfRollup.empresa_id == empresa_id)

    trend_by_route: dict[str, list[TrendBucket]] = {name: [] for name in route_names}
    for tr in trend_q.all():
        if tr.route in trend_by_route:
            trend_by_route[tr.route].append(TrendBucket(hour=tr.hour, p95=tr.p95_ms, count=tr.count))

    result = []
    for r in rows:
        total = r.total_count or 0
        errors = r.total_errors or 0
        result.append(RouteMetrics(
            route=r.route,
            count=total,
            p50=round(r.p50 or 0.0, 2),
            p95=round(r.p95 or 0.0, 2),
            p99=round(r.p99 or 0.0, 2),
            error_rate=round(errors / total, 4) if total else 0.0,
            trend=trend_by_route.get(r.route, []),
        ))

    return RouteMetricsResponse(period=period, routes=result)


_SLOW_THRESHOLD_MS = 1000.0


class EmpresaCostMetrics(BaseModel):
    empresa_id: int | None
    request_count: int
    lioren_call_count: int
    lioren_cost_clp: int
    dte_emitidos_count: int
    slow_request_count: int


class CostTelemetryResponse(BaseModel):
    period: str
    empresas: list[EmpresaCostMetrics]
    total: EmpresaCostMetrics


@router.get("/admin/telemetry/cost", response_model=CostTelemetryResponse, tags=["telemetry"])
def get_telemetry_cost(
    period: Literal["24h", "7d", "30d"] = Query("30d"),
    empresa_id: int | None = Query(None),
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    since = _since(period)

    # --- Lioren cost from cost_rollup ---
    cost_q = (
        db.query(
            CostRollup.empresa_id,
            func.sum(CostRollup.count).label("lioren_calls"),
            func.sum(CostRollup.total_cost_clp).label("lioren_cost"),
        )
        .filter(CostRollup.hour >= since)
        .group_by(CostRollup.empresa_id)
    )
    if empresa_id is not None:
        cost_q = cost_q.filter(CostRollup.empresa_id == empresa_id)
    cost_by_empresa: dict[int | None, dict] = {}
    for row in cost_q.all():
        cost_by_empresa[row.empresa_id] = {
            "lioren_call_count": int(row.lioren_calls or 0),
            "lioren_cost_clp": int(row.lioren_cost or 0),
        }

    # --- Request + slow counts from perf_rollup ---
    perf_q = (
        db.query(
            PerfRollup.empresa_id,
            func.sum(PerfRollup.count).label("req_count"),
            func.sum(
                case((PerfRollup.p95_ms >= _SLOW_THRESHOLD_MS, PerfRollup.count), else_=0)
            ).label("slow_count"),
        )
        .filter(PerfRollup.hour >= since)
        .filter(~PerfRollup.route.in_(_EXCLUDED_ROUTES))
        .filter(~PerfRollup.route.like(f"{_STATIC_PREFIX}%"))
        .group_by(PerfRollup.empresa_id)
    )
    if empresa_id is not None:
        perf_q = perf_q.filter(PerfRollup.empresa_id == empresa_id)
    perf_by_empresa: dict[int | None, dict] = {}
    for row in perf_q.all():
        perf_by_empresa[row.empresa_id] = {
            "request_count": int(row.req_count or 0),
            "slow_request_count": int(row.slow_count or 0),
        }

    # --- DTE emitidos from dte_emisiones joined to facturas for empresa_id ---
    dte_q = (
        db.query(
            Factura.empresa_id,
            func.count(DteEmision.id).label("dte_count"),
        )
        .join(Factura, DteEmision.factura_id == Factura.id)
        .filter(DteEmision.created_at >= since)
        .group_by(Factura.empresa_id)
    )
    if empresa_id is not None:
        dte_q = dte_q.filter(Factura.empresa_id == empresa_id)
    dte_by_empresa: dict[int | None, int] = {}
    for row in dte_q.all():
        dte_by_empresa[row.empresa_id] = int(row.dte_count or 0)

    # Merge by empresa_id
    all_ids: set[int | None] = set(cost_by_empresa) | set(perf_by_empresa) | set(dte_by_empresa)
    empresas: list[EmpresaCostMetrics] = []
    for eid in sorted(all_ids, key=lambda x: (x is None, x)):
        empresas.append(EmpresaCostMetrics(
            empresa_id=eid,
            request_count=perf_by_empresa.get(eid, {}).get("request_count", 0),
            lioren_call_count=cost_by_empresa.get(eid, {}).get("lioren_call_count", 0),
            lioren_cost_clp=cost_by_empresa.get(eid, {}).get("lioren_cost_clp", 0),
            dte_emitidos_count=dte_by_empresa.get(eid, 0),
            slow_request_count=perf_by_empresa.get(eid, {}).get("slow_request_count", 0),
        ))

    total = EmpresaCostMetrics(
        empresa_id=None,
        request_count=sum(e.request_count for e in empresas),
        lioren_call_count=sum(e.lioren_call_count for e in empresas),
        lioren_cost_clp=sum(e.lioren_cost_clp for e in empresas),
        dte_emitidos_count=sum(e.dte_emitidos_count for e in empresas),
        slow_request_count=sum(e.slow_request_count for e in empresas),
    )

    return CostTelemetryResponse(period=period, empresas=empresas, total=total)


_VALID_VITALS = frozenset({"LCP", "FID", "INP", "CLS", "TTFB"})


class WebVitalPayload(BaseModel):
    metric: str
    value: float
    route: str
    user_agent: str
    timestamp: str


@router.post("/telemetry/web-vitals", status_code=204, tags=["telemetry"])
async def post_web_vital(payload: WebVitalPayload, request: Request) -> Response:
    if payload.metric in _VALID_VITALS:
        logger.info(
            "web-vital metric=%s value=%.3f route=%s ua=%.80s ts=%s",
            payload.metric,
            payload.value,
            payload.route,
            payload.user_agent,
            payload.timestamp,
        )
    return Response(status_code=204)
