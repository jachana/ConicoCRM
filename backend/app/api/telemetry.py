"""Admin telemetry endpoints (T2.2+)."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.models.telemetry import PerfRollup
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
