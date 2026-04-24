from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.core.permissions import has_permission
from app.models.tarea import Tarea
from app.models.user import User
from app.schemas.tarea import TareaIn

router = APIRouter()


def prioridad_derivada(t: Tarea) -> Literal["vencida", "hoy", "futura"]:
    today = date.today()
    if t.estado == "pendiente" and t.due_date < today:
        return "vencida"
    if t.due_date == today:
        return "hoy"
    return "futura"


def serialize_tarea(t: Tarea) -> dict:
    return {
        "id": t.id,
        "titulo": t.titulo,
        "descripcion": t.descripcion,
        "due_date": t.due_date,
        "estado": t.estado,
        "motivo_descarte": t.motivo_descarte,
        "origen": t.origen,
        "tipo_regla": t.tipo_regla,
        "prioridad_derivada": prioridad_derivada(t),
        "asignado_id": t.asignado_id,
        "asignado_nombre": t.asignado.name if t.asignado else "",
        "creado_por_id": t.creado_por_id,
        "cliente_id": t.cliente_id,
        "empresa_id": t.empresa_id,
        "cotizacion_id": t.cotizacion_id,
        "nota_venta_id": t.nota_venta_id,
        "factura_id": t.factura_id,
        "producto_id": t.producto_id,
        "completada_at": t.completada_at,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def crear_tarea(
    payload: TareaIn,
    perms: tuple[User, Session] = require_permission("tareas", "create"),
):
    current_user, db = perms

    if current_user.role == "vendedor" and payload.asignado_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vendedor solo puede asignarse a sí mismo",
        )

    asignado = (
        db.query(User)
        .filter(User.id == payload.asignado_id, User.is_active.is_(True))
        .first()
    )
    if asignado is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Usuario asignado no existe o está inactivo",
        )

    t = Tarea(
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        due_date=payload.due_date,
        origen="manual",
        asignado_id=payload.asignado_id,
        creado_por_id=current_user.id,
        cliente_id=payload.cliente_id,
        empresa_id=payload.empresa_id,
        cotizacion_id=payload.cotizacion_id,
        nota_venta_id=payload.nota_venta_id,
        factura_id=payload.factura_id,
        producto_id=payload.producto_id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return serialize_tarea(t)


@router.get("")
def listar_tareas(
    asignado_id: Optional[int] = None,
    estado: str = "pendiente",
    prioridad_derivada_q: Optional[str] = Query(None, alias="prioridad_derivada"),
    cliente_id: Optional[int] = None,
    empresa_id: Optional[int] = None,
    cotizacion_id: Optional[int] = None,
    nota_venta_id: Optional[int] = None,
    factura_id: Optional[int] = None,
    producto_id: Optional[int] = None,
    origen: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms

    q = db.query(Tarea).options(joinedload(Tarea.asignado))

    # Vendedor sin view_all → filtro forzado a sí mismo
    if not has_permission(db, current_user, "tareas", "view_all"):
        q = q.filter(Tarea.asignado_id == current_user.id)
    elif asignado_id is not None:
        q = q.filter(Tarea.asignado_id == asignado_id)

    q = q.filter(Tarea.estado == estado)

    for col, val in [
        (Tarea.cliente_id, cliente_id),
        (Tarea.empresa_id, empresa_id),
        (Tarea.cotizacion_id, cotizacion_id),
        (Tarea.nota_venta_id, nota_venta_id),
        (Tarea.factura_id, factura_id),
        (Tarea.producto_id, producto_id),
    ]:
        if val is not None:
            q = q.filter(col == val)

    if origen is not None:
        q = q.filter(Tarea.origen == origen)

    q = q.order_by(
        case((Tarea.estado == "pendiente", 0), else_=1),
        Tarea.due_date.asc(),
    )

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    serialized = [serialize_tarea(t) for t in items]
    if prioridad_derivada_q:
        serialized = [s for s in serialized if s["prioridad_derivada"] == prioridad_derivada_q]

    return {"items": serialized, "total": total, "page": page, "page_size": page_size}
