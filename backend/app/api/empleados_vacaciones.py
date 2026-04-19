from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.empleado import Empleado
from app.models.empleado_vacacion import EmpleadoVacacion
from app.models.user import User
from app.schemas.empleado_vacacion import EmpleadoVacacionCreate, EmpleadoVacacionOut, EmpleadoVacacionUpdate

router = APIRouter()


def _get_empleado_or_404(db: Session, empleado_id: int) -> Empleado:
    emp = db.get(Empleado, empleado_id)
    if not emp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")
    return emp


@router.get("/{empleado_id}/vacaciones/", response_model=list[EmpleadoVacacionOut])
def listar_vacaciones(
    empleado_id: int,
    perms: tuple[User, Session] = require_permission("rrhh", "view"),
):
    _, db = perms
    _get_empleado_or_404(db, empleado_id)
    return db.query(EmpleadoVacacion).filter_by(empleado_id=empleado_id).order_by(EmpleadoVacacion.fecha_inicio.desc()).all()


@router.post("/{empleado_id}/vacaciones/", response_model=EmpleadoVacacionOut, status_code=status.HTTP_201_CREATED)
def registrar_vacacion(
    empleado_id: int,
    body: EmpleadoVacacionCreate,
    perms: tuple[User, Session] = require_permission("rrhh", "create"),
):
    _, db = perms
    _get_empleado_or_404(db, empleado_id)
    vac = EmpleadoVacacion(empleado_id=empleado_id, **body.model_dump())
    db.add(vac)
    db.commit()
    db.refresh(vac)
    return vac


@router.patch("/{empleado_id}/vacaciones/{vac_id}", response_model=EmpleadoVacacionOut)
def actualizar_vacacion(
    empleado_id: int,
    vac_id: int,
    body: EmpleadoVacacionUpdate,
    perms: tuple[User, Session] = require_permission("rrhh", "edit"),
):
    _, db = perms
    _get_empleado_or_404(db, empleado_id)
    vac = db.get(EmpleadoVacacion, vac_id)
    if not vac or vac.empleado_id != empleado_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacación no encontrada")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(vac, field, value)
    db.commit()
    db.refresh(vac)
    return vac


@router.delete("/{empleado_id}/vacaciones/{vac_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_vacacion(
    empleado_id: int,
    vac_id: int,
    perms: tuple[User, Session] = require_permission("rrhh", "delete"),
):
    _, db = perms
    _get_empleado_or_404(db, empleado_id)
    vac = db.get(EmpleadoVacacion, vac_id)
    if not vac or vac.empleado_id != empleado_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vacación no encontrada")
    db.delete(vac)
    db.commit()
