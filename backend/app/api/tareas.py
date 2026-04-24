from datetime import date, datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.core.permissions import has_permission
from app.models.tarea import Tarea
from app.models.user import User
from app.schemas.tarea import DescartarIn, MisPendientesOut, ReasignarIn, TareaIn, TareaOut, TareaPatch

router = APIRouter()


ENTIDAD_FK_MAP = {
    "cliente": Tarea.cliente_id,
    "empresa": Tarea.empresa_id,
    "cotizacion": Tarea.cotizacion_id,
    "nota_venta": Tarea.nota_venta_id,
    "factura": Tarea.factura_id,
    "producto": Tarea.producto_id,
}


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


@router.post("", response_model=TareaOut, status_code=status.HTTP_201_CREATED)
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


def _get_or_404(db: Session, tarea_id: int) -> Tarea:
    t = db.query(Tarea).options(joinedload(Tarea.asignado)).filter(Tarea.id == tarea_id).first()
    if t is None:
        raise HTTPException(404, detail="Tarea no existe")
    return t


def _require_owner_or_admin(t: Tarea, user: User, db: Session):
    if t.asignado_id == user.id or t.creado_por_id == user.id:
        return
    if has_permission(db, user, "tareas", "view_all"):
        return
    raise HTTPException(403, detail="Sin acceso a esta tarea")


@router.get("/mis-pendientes", response_model=MisPendientesOut)
def mis_pendientes(perms: tuple[User, Session] = require_permission("tareas", "view")):
    current_user, db = perms
    today = date.today()

    q = db.query(Tarea).options(joinedload(Tarea.asignado)).filter(
        Tarea.asignado_id == current_user.id,
        Tarea.estado == "pendiente",
    )

    tareas = q.order_by(Tarea.due_date.asc()).all()
    vencidas = sum(1 for t in tareas if t.due_date < today)
    hoy = sum(1 for t in tareas if t.due_date == today)
    futuras = sum(1 for t in tareas if t.due_date > today)

    return {
        "vencidas": vencidas,
        "hoy": hoy,
        "futuras": futuras,
        "total": len(tareas),
        "tareas": [serialize_tarea(t) for t in tareas[:5]],
    }


@router.get("/timeline/{entidad_tipo}/{entidad_id}")
def timeline(
    entidad_tipo: str,
    entidad_id: int,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    _, db = perms
    col = ENTIDAD_FK_MAP.get(entidad_tipo)
    if col is None:
        raise HTTPException(404, detail="Tipo de entidad inválido")

    tareas = (
        db.query(Tarea)
        .options(joinedload(Tarea.asignado))
        .filter(col == entidad_id)
        .order_by(Tarea.due_date.desc())
        .all()
    )
    return [serialize_tarea(t) for t in tareas]


@router.get("/{tarea_id}", response_model=TareaOut)
def get_tarea(
    tarea_id: int,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    _require_owner_or_admin(t, current_user, db)
    return serialize_tarea(t)


@router.patch("/{tarea_id}", response_model=TareaOut)
def patch_tarea(
    tarea_id: int,
    payload: TareaPatch,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)

    is_admin = has_permission(db, current_user, "tareas", "admin")

    if t.origen == "auto":
        if payload.titulo is not None or payload.descripcion is not None:
            raise HTTPException(400, detail="Tareas auto no permiten editar título/descripción")
        if not is_admin:
            raise HTTPException(403, detail="Solo admin edita tareas auto")
    else:
        if t.creado_por_id != current_user.id and t.asignado_id != current_user.id and not is_admin:
            raise HTTPException(403, detail="Sin permisos para editar")

    if payload.asignado_id is not None and payload.asignado_id != t.asignado_id:
        if not is_admin:
            raise HTTPException(403, detail="Solo admin reasigna")
        asignado = db.query(User).filter(User.id == payload.asignado_id, User.is_active.is_(True)).first()
        if asignado is None:
            raise HTTPException(422, detail="Usuario asignado inválido")

    for field in ("titulo", "descripcion", "due_date", "asignado_id"):
        val = getattr(payload, field)
        if val is not None:
            setattr(t, field, val)

    db.commit()
    db.refresh(t)
    return serialize_tarea(t)


@router.delete("/{tarea_id}", status_code=204)
def delete_tarea(
    tarea_id: int,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    if t.origen != "manual":
        raise HTTPException(400, detail="Solo tareas manuales se pueden eliminar")

    is_admin = has_permission(db, current_user, "tareas", "admin")
    if t.creado_por_id != current_user.id and not is_admin:
        raise HTTPException(403, detail="Solo creador o admin")

    db.delete(t)
    db.commit()


@router.post("/{tarea_id}/completar", response_model=TareaOut)
def completar(
    tarea_id: int,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    _require_owner_or_admin(t, current_user, db)
    if t.estado == "hecha":
        return serialize_tarea(t)
    t.estado = "hecha"
    t.completada_at = datetime.now(timezone.utc)
    t.completada_por_id = current_user.id
    db.commit()
    db.refresh(t)
    return serialize_tarea(t)


@router.post("/{tarea_id}/descartar", response_model=TareaOut)
def descartar(
    tarea_id: int,
    payload: DescartarIn,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    _require_owner_or_admin(t, current_user, db)
    t.estado = "descartada"
    t.motivo_descarte = payload.motivo
    db.commit()
    db.refresh(t)
    return serialize_tarea(t)


@router.post("/{tarea_id}/reasignar", response_model=TareaOut)
def reasignar(
    tarea_id: int,
    payload: ReasignarIn,
    perms: tuple[User, Session] = require_permission("tareas", "admin"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    asignado = db.query(User).filter(User.id == payload.asignado_id, User.is_active.is_(True)).first()
    if asignado is None:
        raise HTTPException(422, detail="Usuario inválido")
    t.asignado_id = payload.asignado_id
    db.commit()
    db.refresh(t)
    return serialize_tarea(t)
