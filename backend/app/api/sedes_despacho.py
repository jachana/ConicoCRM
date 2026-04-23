from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import require_permission
from app.models.sede_despacho import SedeDespacho
from app.models.nota_venta import NotaVenta
from app.models.user import User
from app.schemas.sede_despacho import SedeDespachoCreate, SedeDespachoOut, SedeDespachoUpdate

router = APIRouter()


@router.get("/", response_model=list[SedeDespachoOut])
def listar_sedes(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    return db.query(SedeDespacho).filter(SedeDespacho.empresa_id == empresa_id).all()


@router.post("/", response_model=SedeDespachoOut, status_code=201)
def crear_sede(
    body: SedeDespachoCreate,
    perms: tuple[User, Session] = require_permission("empresas", "edit"),
):
    _, db = perms
    sede = SedeDespacho(**body.model_dump())
    db.add(sede)
    db.commit()
    db.refresh(sede)
    return sede


@router.put("/{sede_id}", response_model=SedeDespachoOut)
def actualizar_sede(
    sede_id: int,
    body: SedeDespachoUpdate,
    perms: tuple[User, Session] = require_permission("empresas", "edit"),
):
    _, db = perms
    sede = db.get(SedeDespacho, sede_id)
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(sede, k, v)
    db.commit()
    db.refresh(sede)
    return sede


@router.delete("/{sede_id}", status_code=204)
def eliminar_sede(
    sede_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "delete"),
):
    _, db = perms
    sede = db.get(SedeDespacho, sede_id)
    if not sede:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    if db.query(NotaVenta).filter(NotaVenta.sede_despacho_id == sede_id).first():
        raise HTTPException(
            status_code=409,
            detail="Sede referenciada por una o más notas de venta",
        )
    db.delete(sede)
    db.commit()
