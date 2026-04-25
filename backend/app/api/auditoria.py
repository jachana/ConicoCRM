"""API de auditoría: listado paginado con filtros + export CSV.

Permiso: `usuarios:admin` (alineado con el patrón existente — el módulo
`usuarios` ya cubre administración de cuentas; auditoría es un superset
admin-only). El permiso se exige tanto en list como en export.
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.auditoria import AuditLogOut, AuditLogPage

router = APIRouter()


def _parse_iso(s: str | None, field: str) -> datetime | None:
    if not s:
        return None
    try:
        # Permite tanto "YYYY-MM-DD" como ISO completo. Para `to_date`
        # date-only, lo tratamos como fin-de-día (inclusivo) para que
        # `to_date=2026-04-24` incluya logs de ese día.
        if len(s) == 10:
            if field == "to_date":
                return datetime.fromisoformat(s + "T23:59:59.999999")
            return datetime.fromisoformat(s + "T00:00:00")
        return datetime.fromisoformat(s)
    except ValueError:
        raise HTTPException(422, detail=f"Formato inválido en `{field}`: {s!r}")


def _build_query(
    db: Session,
    *,
    user_id: int | None,
    entity_type: str | None,
    action: str | None,
    entity_id: str | None,
    from_date: datetime | None,
    to_date: datetime | None,
):
    q = db.query(AuditLog)
    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if action:
        q = q.filter(AuditLog.action == action)
    if entity_id:
        q = q.filter(AuditLog.entity_id == entity_id)
    if from_date is not None:
        q = q.filter(AuditLog.created_at >= from_date)
    if to_date is not None:
        q = q.filter(AuditLog.created_at <= to_date)
    return q


def _attach_user_info(db: Session, items: list[AuditLog]) -> list[dict]:
    user_ids = {it.user_id for it in items if it.user_id is not None}
    user_map: dict[int, tuple[str, str]] = {}
    if user_ids:
        users = db.query(User).filter(User.id.in_(user_ids)).all()
        user_map = {u.id: (u.name, u.email) for u in users}
    out = []
    for it in items:
        name, email = user_map.get(it.user_id, (None, None)) if it.user_id else (None, None)
        out.append({
            "id": it.id,
            "user_id": it.user_id,
            "user_name": name,
            "user_email": email,
            "action": it.action,
            "entity_type": it.entity_type,
            "entity_id": it.entity_id,
            "diff_json": it.diff_json,
            "ip": it.ip,
            "user_agent": it.user_agent,
            "created_at": it.created_at,
        })
    return out


@router.get("", response_model=AuditLogPage)
def listar_auditoria(
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    entity_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    perms: tuple[User, Session] = require_permission("usuarios", "admin"),
):
    _, db = perms
    fd = _parse_iso(from_date, "from_date")
    td = _parse_iso(to_date, "to_date")
    q = _build_query(
        db,
        user_id=user_id,
        entity_type=entity_type,
        action=action,
        entity_id=entity_id,
        from_date=fd,
        to_date=td,
    )
    total = q.count()
    items = (
        q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "items": _attach_user_info(db, items),
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/export.csv")
def exportar_auditoria_csv(
    user_id: Optional[int] = None,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    entity_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    perms: tuple[User, Session] = require_permission("usuarios", "admin"),
):
    _, db = perms
    fd = _parse_iso(from_date, "from_date")
    td = _parse_iso(to_date, "to_date")
    q = _build_query(
        db,
        user_id=user_id,
        entity_type=entity_type,
        action=action,
        entity_id=entity_id,
        from_date=fd,
        to_date=td,
    ).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())

    # Pre-compute user_map una sola vez con un subquery de user_ids distintos
    # del resultado filtrado. Evita N+1 sin materializar todos los AuditLog en memoria.
    distinct_user_ids_select = (
        q.with_entities(AuditLog.user_id)
        .filter(AuditLog.user_id.isnot(None))
        .distinct()
        .subquery()
        .select()
    )
    users = db.query(User).filter(User.id.in_(distinct_user_ids_select)).all()
    user_map: dict[int, tuple[str, str]] = {u.id: (u.name, u.email) for u in users}

    def _stream():
        buf = io.StringIO()
        # BOM para que Excel reconozca UTF-8.
        buf.write("﻿")
        writer = csv.writer(buf)
        writer.writerow([
            "id", "created_at", "user_id", "user_name", "user_email",
            "action", "entity_type", "entity_id", "ip", "user_agent", "diff_json",
        ])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        for it in q.yield_per(500):
            name, email = user_map.get(it.user_id, (None, None)) if it.user_id else (None, None)
            writer.writerow([
                it.id,
                it.created_at.isoformat() if it.created_at else "",
                it.user_id or "",
                name or "",
                email or "",
                it.action,
                it.entity_type,
                it.entity_id,
                it.ip or "",
                it.user_agent or "",
                json.dumps(it.diff_json, ensure_ascii=False) if it.diff_json else "",
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    return StreamingResponse(
        _stream(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=auditoria.csv"},
    )
