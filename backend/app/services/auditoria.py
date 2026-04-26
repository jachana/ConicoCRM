"""Auditoría global vía SQLAlchemy event listeners.

Estrategia
----------
- Un set de modelos auditables (`AUDITABLE_MODELS`) define qué tablas se loggean.
- El listener `before_flush` inspecta `session.new` / `session.dirty` / `session.deleted`,
  computa snapshots `before`/`after` filtrados (campos sensibles excluidos),
  y agrega `AuditLog` rows al mismo flush.
- El contexto (user_id, ip, user_agent) se obtiene desde `session.info`,
  poblado por el middleware `AuditContextMiddleware` por request.
- El listener nunca se aplica a `AuditLog` mismo (evita recursión infinita).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from loguru import logger
from sqlalchemy import event, inspect
from sqlalchemy.orm import Session


# Campos sensibles que NUNCA deben aparecer en diff_json.
SENSITIVE_FIELDS: set[str] = {
    "password",
    "hashed_password",
    "password_hash",
    "jwt_secret",
    "secret_key",
    "totp_secret",
    "lioren_api_key",
    "lioren_token",
    "smtp_password",
    "refresh_token",
    "access_token",
    "api_key",
    "token",
}


def _is_auditable(instance: Any) -> bool:
    return type(instance).__name__ in _AUDITABLE_MODEL_NAMES


# Modelos auditables (por classname). El registro de listeners los importa.
_AUDITABLE_MODEL_NAMES: set[str] = {
    "Cotizacion",
    "CotizacionLinea",
    "NotaVenta",
    "NotaVentaLinea",
    "Factura",
    "FacturaLinea",
    "NotaCredito",
    "NotaCreditoLinea",
    "NotaDebito",
    "NotaDebitoLinea",
    "Boleta",
    "BoletaLinea",
    "GuiaDespacho",
    "GuiaDespachoLinea",
    "Producto",
    "ListaPrecios",
    "ListaPreciosItem",
    "Empresa",
    "Cliente",
    "User",
    "PermissionOverride",
    "SystemConfig",
}


def _serialize_value(v: Any) -> Any:
    """Convierte valores SQLAlchemy en JSON-serializable."""
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, Decimal):
        # Numeric → string para preservar precisión sin warnings JSON.
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, (list, tuple)):
        return [_serialize_value(x) for x in v]
    if isinstance(v, dict):
        return {k: _serialize_value(val) for k, val in v.items()}
    # Fallback: repr.
    return str(v)


def _snapshot(instance: Any) -> dict[str, Any]:
    """Snapshot de columnas (no relaciones) excluyendo campos sensibles."""
    mapper = inspect(instance).mapper
    out: dict[str, Any] = {}
    for col in mapper.columns:
        key = col.key
        if key in SENSITIVE_FIELDS:
            continue
        try:
            val = getattr(instance, key)
        except Exception:
            continue
        out[key] = _serialize_value(val)
    return out


def _changed_snapshot(instance: Any) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    """Para UPDATE: devuelve (before, after, changed_fields) usando SQLAlchemy attribute history."""
    state = inspect(instance)
    mapper = state.mapper
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    changed: list[str] = []
    for col in mapper.columns:
        key = col.key
        if key in SENSITIVE_FIELDS:
            continue
        try:
            hist = state.attrs[key].history
        except Exception:
            continue
        if hist.has_changes() and (hist.added or hist.deleted):
            old = hist.deleted[0] if hist.deleted else None
            new = hist.added[0] if hist.added else getattr(instance, key, None)
            before[key] = _serialize_value(old)
            after[key] = _serialize_value(new)
            changed.append(key)
    return before, after, changed


def _entity_id_str(instance: Any) -> str | None:
    """PK → string. Si la PK aún no está asignada (pre-flush), retorna None."""
    try:
        mapper = inspect(instance).mapper
        pk_cols = mapper.primary_key
        vals = []
        for col in pk_cols:
            v = getattr(instance, col.key, None)
            if v is None:
                return None
            vals.append(str(v))
        return ",".join(vals) if vals else None
    except Exception:
        return None


def _ctx(session: Session) -> dict[str, Any]:
    """Obtiene el contexto de auditoría: primero `session.info` (override útil
    para tests / jobs), luego la `ContextVar` poblada por el middleware HTTP.
    """
    info = session.info or {}
    if "audit_user_id" in info or "audit_ip" in info or "audit_user_agent" in info:
        return {
            "user_id": info.get("audit_user_id"),
            "ip": info.get("audit_ip"),
            "user_agent": info.get("audit_user_agent"),
        }
    try:
        from app.middleware.audit_context import get_audit_context
        ctx = get_audit_context()
    except Exception:
        ctx = {}
    return {
        "user_id": ctx.get("user_id"),
        "ip": ctx.get("ip"),
        "user_agent": ctx.get("user_agent"),
    }


def _make_log_row(
    session: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    diff: dict[str, Any] | None,
):
    # Import perezoso para evitar ciclos de import.
    from app.models.audit_log import AuditLog

    ctx = _ctx(session)
    return AuditLog(
        user_id=ctx["user_id"],
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        diff_json=diff,
        ip=ctx["ip"],
        user_agent=ctx["user_agent"],
    )


# Caché de inserts pendientes a ser resueltos post-flush (cuando se asigna PK).
_PENDING_INSERTS_KEY = "_audit_pending_inserts"


def _before_flush(session: Session, flush_context, instances):
    """Captura UPDATE y DELETE (donde el before-state aún es accesible)."""
    if session.info.get("audit_disabled"):
        return

    try:
        rows: list[Any] = []

        # UPDATE
        for inst in list(session.dirty):
            if not _is_auditable(inst):
                continue
            if not session.is_modified(inst, include_collections=False):
                continue
            before, after, changed = _changed_snapshot(inst)
            if not changed:
                continue
            ent_id = _entity_id_str(inst)
            if ent_id is None:
                continue
            rows.append(
                _make_log_row(
                    session,
                    action="update",
                    entity_type=type(inst).__name__,
                    entity_id=ent_id,
                    diff={"before": before, "after": after, "changed": changed},
                )
            )

        # DELETE
        for inst in list(session.deleted):
            if not _is_auditable(inst):
                continue
            before = _snapshot(inst)
            ent_id = _entity_id_str(inst)
            if ent_id is None:
                continue
            rows.append(
                _make_log_row(
                    session,
                    action="delete",
                    entity_type=type(inst).__name__,
                    entity_id=ent_id,
                    diff={"before": before},
                )
            )

        # INSERT — capturamos los instances pendientes en session.info y resolvemos PK
        # post-flush (vía `after_flush_postexec`) para tener entity_id real.
        pending: list[Any] = session.info.setdefault(_PENDING_INSERTS_KEY, [])
        for inst in list(session.new):
            if not _is_auditable(inst):
                continue
            pending.append(inst)

        for r in rows:
            session.add(r)
    except Exception as exc:  # noqa: BLE001 — audit must never block business ops
        logger.exception("audit.listener_failed event=before_flush")


def _after_flush_postexec(session: Session, flush_context):
    """Resuelve INSERT logs ahora que las PKs están asignadas."""
    if session.info.get("audit_disabled"):
        return
    try:
        pending: list[Any] = session.info.pop(_PENDING_INSERTS_KEY, [])
        if not pending:
            return
        rows = []
        for inst in pending:
            ent_id = _entity_id_str(inst)
            if ent_id is None:
                continue
            after = _snapshot(inst)
            rows.append(
                _make_log_row(
                    session,
                    action="create",
                    entity_type=type(inst).__name__,
                    entity_id=ent_id,
                    diff={"after": after},
                )
            )
        if rows:
            # Marcar audit_disabled durante el sub-add para evitar que el
            # próximo `before_flush` re-procese estos AuditLog.
            prev = session.info.get("audit_disabled", False)
            session.info["audit_disabled"] = True
            try:
                for r in rows:
                    session.add(r)
            finally:
                session.info["audit_disabled"] = prev
    except Exception as exc:  # noqa: BLE001 — audit must never block business ops
        logger.exception("audit.listener_failed event=after_flush_postexec")


_LISTENERS_REGISTERED = False


def register_listeners() -> None:
    """Idempotente: registra listeners contra `Session` global."""
    global _LISTENERS_REGISTERED
    if _LISTENERS_REGISTERED:
        return
    event.listen(Session, "before_flush", _before_flush)
    event.listen(Session, "after_flush_postexec", _after_flush_postexec)
    _LISTENERS_REGISTERED = True


def unregister_listeners() -> None:
    """Solo para tests."""
    global _LISTENERS_REGISTERED
    if not _LISTENERS_REGISTERED:
        return
    event.remove(Session, "before_flush", _before_flush)
    event.remove(Session, "after_flush_postexec", _after_flush_postexec)
    _LISTENERS_REGISTERED = False


# Helper público para escribir manualmente (login, etc.) — no se usa en V1
# pero lo dejamos disponible.
def log_manual(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    diff: dict[str, Any] | None = None,
) -> None:
    db.add(_make_log_row(db, action=action, entity_type=entity_type, entity_id=entity_id, diff=diff))
