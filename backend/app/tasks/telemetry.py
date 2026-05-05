"""Telemetry T2.1: hourly perf + cost aggregation tasks."""
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.telemetry import PerfRollup, CostRollup
from app.core.logging import logger

PERF_REDIS_KEY = "conico:perf_events"
COST_REDIS_KEY = "conico:cost_events"


def _drain_redis(redis_client, key: str, max_items: int = 100_000) -> list[dict]:
    """Atomically drain up to max_items from a Redis list. Returns parsed dicts."""
    pipe = redis_client.pipeline()
    pipe.lrange(key, 0, max_items - 1)
    pipe.ltrim(key, max_items, -1)
    raw_list, _ = pipe.execute()
    results = []
    for raw in raw_list:
        try:
            results.append(json.loads(raw))
        except Exception:
            pass
    return results


def _floor_hour(ts: int) -> datetime:
    """Floor a unix timestamp to the hour boundary, UTC."""
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return dt.replace(minute=0, second=0, microsecond=0)


def _percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = max(0, int(len(sorted_vals) * p / 100) - 1)
    return sorted_vals[min(idx, len(sorted_vals) - 1)]


@celery_app.task(name="app.tasks.telemetry.aggregate_perf_hourly", bind=True, max_retries=3)
def aggregate_perf_hourly(self):
    """Drain perf_events from Redis and write hourly rollup rows to perf_rollup."""
    from app.core.request_logger import _get_redis
    r = _get_redis()
    if r is None:
        logger.warning("telemetry.aggregate_perf_hourly: redis unavailable, skipping")
        return

    events = _drain_redis(r, PERF_REDIS_KEY)
    if not events:
        return

    # Group by (hour, route, empresa_id)
    buckets: dict[tuple, list[dict]] = {}
    for ev in events:
        try:
            key = (_floor_hour(int(ev["ts"])), str(ev.get("route", "")), ev.get("empresa_id"))
            buckets.setdefault(key, []).append(ev)
        except Exception:
            pass

    db = SessionLocal()
    try:
        inserted = 0
        for (hour, route, empresa_id), evs in buckets.items():
            latencies = sorted(float(e.get("latency_ms", 0)) for e in evs)
            errors = sum(1 for e in evs if int(e.get("status", 200)) >= 500)
            total_queries = sum(int(e.get("queries", 0)) for e in evs)
            row = PerfRollup(
                hour=hour,
                route=route,
                empresa_id=empresa_id,
                count=len(evs),
                p50_ms=_percentile(latencies, 50),
                p95_ms=_percentile(latencies, 95),
                p99_ms=_percentile(latencies, 99),
                errors=errors,
                total_queries=total_queries,
            )
            db.add(row)
            inserted += 1
        db.commit()
        logger.info(f"telemetry.aggregate_perf_hourly: inserted {inserted} rollup rows from {len(events)} events")
    except Exception as exc:
        db.rollback()
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


@celery_app.task(name="app.tasks.telemetry.aggregate_cost_hourly", bind=True, max_retries=3)
def aggregate_cost_hourly(self):
    """Drain cost_events from Redis and write hourly cost rollup rows."""
    from app.core.request_logger import _get_redis
    r = _get_redis()
    if r is None:
        return

    events = _drain_redis(r, COST_REDIS_KEY)
    if not events:
        return

    buckets: dict[tuple, list[dict]] = {}
    for ev in events:
        try:
            key = (_floor_hour(int(ev["ts"])), ev.get("empresa_id"))
            buckets.setdefault(key, []).append(ev)
        except Exception:
            pass

    db = SessionLocal()
    try:
        for (hour, empresa_id), evs in buckets.items():
            total_cost = sum(int(e.get("cost_clp", 0)) for e in evs)
            row = CostRollup(
                hour=hour,
                empresa_id=empresa_id,
                total_cost_clp=total_cost,
                count=len(evs),
            )
            db.add(row)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


@celery_app.task(name="app.tasks.telemetry.cleanup_old_rollups")
def cleanup_old_rollups():
    """Delete rollup rows older than 90 days. Runs weekly."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=90)
    db = SessionLocal()
    try:
        perf_deleted = db.query(PerfRollup).filter(PerfRollup.hour < cutoff).delete()
        cost_deleted = db.query(CostRollup).filter(CostRollup.hour < cutoff).delete()
        db.commit()
        logger.info(f"telemetry.cleanup: deleted {perf_deleted} perf + {cost_deleted} cost rows older than 90d")
    finally:
        db.close()
