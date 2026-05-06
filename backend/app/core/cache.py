from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Any, Optional

import redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

TTL_SETTINGS: dict[str, int] = {
    "ventas": int(os.environ.get("CACHE_TTL_VENTAS", 120)),
    "cobranza": int(os.environ.get("CACHE_TTL_COBRANZA", 120)),
    "inventario": int(os.environ.get("CACHE_TTL_INVENTARIO", 60)),
    "compras": int(os.environ.get("CACHE_TTL_COMPRAS", 120)),
    "margenes": int(os.environ.get("CACHE_TTL_MARGENES", 300)),
    "dte": int(os.environ.get("CACHE_TTL_DTE", 300)),
    "por_marca": int(os.environ.get("CACHE_TTL_POR_MARCA", 300)),
    "kpis": int(os.environ.get("CACHE_TTL_KPIS", 60)),
    "default": int(os.environ.get("CACHE_TTL_DEFAULT", 120)),
}


class ReportCache:
    def __init__(self, redis_url: str) -> None:
        self._client = redis.from_url(redis_url, decode_responses=True)

    def _build_key(self, empresa_id: int, endpoint: str, filters: dict) -> str:
        sorted_filters = json.dumps(filters, sort_keys=True, ensure_ascii=False)
        filters_hash = hashlib.sha256(sorted_filters.encode("utf-8")).hexdigest()[:16]
        return f"cache:report:{empresa_id}:{endpoint}:{filters_hash}"

    def get(self, empresa_id: int, endpoint: str, filters: dict) -> Optional[Any]:
        key = self._build_key(empresa_id, endpoint, filters)
        try:
            raw = self._client.get(key)
        except RedisError as exc:
            logger.warning("cache.get error key=%s: %s", key, exc)
            return None
        if raw is None:
            logger.info("cache.miss key=%s", key)
            return None
        logger.info("cache.hit key=%s", key)
        return json.loads(raw)

    def set(self, empresa_id: int, endpoint: str, filters: dict, value: Any, ttl: int) -> None:
        key = self._build_key(empresa_id, endpoint, filters)
        try:
            self._client.set(key, json.dumps(value, ensure_ascii=False), ex=ttl)
        except RedisError as exc:
            logger.warning("cache.set error key=%s: %s", key, exc)

    def invalidate_pattern(self, empresa_id: int, endpoints: list[str]) -> None:
        for endpoint in endpoints:
            pattern = f"cache:report:{empresa_id}:{endpoint}:*"
            try:
                cursor = 0
                while True:
                    cursor, keys = self._client.scan(cursor, match=pattern, count=100)
                    if keys:
                        self._client.delete(*keys)
                    if cursor == 0:
                        break
            except RedisError as exc:
                logger.warning("cache.invalidate_pattern error pattern=%s: %s", pattern, exc)

    def invalidate_empresa(self, empresa_id: int) -> None:
        pattern = f"cache:report:{empresa_id}:*"
        try:
            cursor = 0
            while True:
                cursor, keys = self._client.scan(cursor, match=pattern, count=100)
                if keys:
                    self._client.delete(*keys)
                if cursor == 0:
                    break
        except RedisError as exc:
            logger.warning("cache.invalidate_empresa error pattern=%s: %s", pattern, exc)


report_cache: Optional[ReportCache] = None


def init_report_cache(redis_url: str) -> None:
    global report_cache
    report_cache = ReportCache(redis_url)


def get_report_cache() -> Optional[ReportCache]:
    return report_cache
