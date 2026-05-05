from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_modulo, require_permission
from app.models.user import User
from app.models.regla_tarea import ReglaTarea
from app.schemas.regla_tarea import ReglaTareaOut, ReglaTareaPatch

router = APIRouter(prefix="/tareas/reglas", tags=["tareas"], dependencies=[require_modulo("reglas_tareas")])


@router.get("", response_model=list[ReglaTareaOut])
def listar_reglas(perms: tuple[User, Session] = require_permission("tareas", "admin")):
    _, db = perms
    return db.query(ReglaTarea).order_by(ReglaTarea.id).all()


@router.patch("/{tipo}", response_model=ReglaTareaOut)
def patch_regla(
    tipo: str,
    payload: ReglaTareaPatch,
    perms: tuple[User, Session] = require_permission("tareas", "admin"),
):
    _, db = perms
    r = db.query(ReglaTarea).filter(ReglaTarea.tipo == tipo).first()
    if r is None:
        raise HTTPException(404, detail="Regla no existe")
    for f in ("activa", "offset_dias", "asignado_rol"):
        v = getattr(payload, f)
        if v is not None:
            setattr(r, f, v)
    db.commit()
    db.refresh(r)
    return r
