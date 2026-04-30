"""Notification service.

Centralized helpers to create in-app notifications. Callers pass an active
SQLAlchemy session — caller controls commit vs flush so the notification
participates in the same transaction as the originating action.

Notification `tipo` values (extend as needed):
- tarea_asignada      — vendedor/usuario X recibió una tarea
- tarea_vencida       — tarea pendiente venció (background job)
- aprobacion_pendiente — admin/subadmin debe aprobar (crédito, margen)
- aprobacion_resuelta  — vendedor: aprobada/rechazada
"""
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.models.notification import Notification


def create_notification(
    db: Session,
    *,
    user_id: int,
    tipo: str,
    titulo: str,
    cuerpo: str | None = None,
    payload: dict[str, Any] | None = None,
    flush: bool = True,
) -> Notification:
    """Create a single notification. Caller commits."""
    n = Notification(
        user_id=user_id,
        tipo=tipo,
        titulo=titulo,
        cuerpo=cuerpo,
        payload=payload or {},
    )
    db.add(n)
    if flush:
        db.flush()
    return n


def create_for_users(
    db: Session,
    *,
    user_ids: Iterable[int],
    tipo: str,
    titulo: str,
    cuerpo: str | None = None,
    payload: dict[str, Any] | None = None,
) -> list[Notification]:
    """Fan-out: same notification to multiple users. Caller commits."""
    out: list[Notification] = []
    seen: set[int] = set()
    for uid in user_ids:
        if uid in seen:
            continue
        seen.add(uid)
        out.append(
            create_notification(
                db,
                user_id=uid,
                tipo=tipo,
                titulo=titulo,
                cuerpo=cuerpo,
                payload=payload,
                flush=False,
            )
        )
    if out:
        db.flush()
    return out
