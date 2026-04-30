from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import (
    MarkReadOut,
    NotificationListOut,
    NotificationOut,
    UnreadCountOut,
)

router = APIRouter()


def _serialize(n: Notification) -> dict:
    return {
        "id": n.id,
        "tipo": n.tipo,
        "titulo": n.titulo,
        "cuerpo": n.cuerpo,
        "payload": n.payload or {},
        "leida_at": n.leida_at,
        "created_at": n.created_at,
    }


@router.get("", response_model=NotificationListOut)
def listar(
    unread: bool = Query(False, description="Si true, solo no leídas"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base = db.query(Notification).filter(Notification.user_id == current_user.id)
    unread_count = base.filter(Notification.leida_at.is_(None)).count()

    q = base
    if unread:
        q = q.filter(Notification.leida_at.is_(None))

    total = q.count()
    items = (
        q.order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [_serialize(n) for n in items],
        "total": total,
        "unread": unread_count,
    }


@router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.leida_at.is_(None),
        )
        .count()
    )
    return {"unread": n}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def marcar_leida(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if n is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notificación no encontrada",
        )
    if n.leida_at is None:
        n.leida_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(n)
    return _serialize(n)


@router.post("/read-all", response_model=MarkReadOut)
def marcar_todas_leidas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    rows = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.leida_at.is_(None),
        )
        .update({Notification.leida_at: now}, synchronize_session=False)
    )
    db.commit()
    return {"marked": int(rows)}


@router.delete("/{notification_id}", status_code=204)
def eliminar(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if n is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notificación no encontrada",
        )
    db.delete(n)
    db.commit()
