from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.empleado import Empleado
from app.models.user import User
from app.schemas.empleado import EmpleadoCreate, EmpleadoOut, EmpleadoUpdate

router = APIRouter()


@router.get("/", response_model=list[EmpleadoOut])
def listar_empleados(
    q: str = Query(""),
    perms: tuple[User, Session] = require_permission("rrhh", "view"),
):
    _, db = perms
    query = db.query(Empleado)
    if q:
        query = query.filter(Empleado.nombre.ilike(f"%{q}%") | Empleado.cargo.ilike(f"%{q}%"))
    return query.order_by(Empleado.nombre).all()


@router.post("/", response_model=EmpleadoOut, status_code=status.HTTP_201_CREATED)
def crear_empleado(
    body: EmpleadoCreate,
    perms: tuple[User, Session] = require_permission("rrhh", "create"),
):
    _, db = perms
    emp = Empleado(**body.model_dump())
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


@router.get("/{empleado_id}", response_model=EmpleadoOut)
def obtener_empleado(
    empleado_id: int,
    perms: tuple[User, Session] = require_permission("rrhh", "view"),
):
    _, db = perms
    emp = db.get(Empleado, empleado_id)
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")
    return emp


@router.patch("/{empleado_id}", response_model=EmpleadoOut)
def actualizar_empleado(
    empleado_id: int,
    body: EmpleadoUpdate,
    perms: tuple[User, Session] = require_permission("rrhh", "edit"),
):
    _, db = perms
    emp = db.get(Empleado, empleado_id)
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(emp, field, value)
    db.commit()
    db.refresh(emp)
    return emp


@router.delete("/{empleado_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_empleado(
    empleado_id: int,
    perms: tuple[User, Session] = require_permission("rrhh", "delete"),
):
    _, db = perms
    emp = db.get(Empleado, empleado_id)
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")
    db.delete(emp)
    db.commit()
