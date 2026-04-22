from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import require_permission
from app.models.banco_receptor import BancoReceptor
from app.models.user import User
from app.schemas.banco_receptor import BancoReceptorCreate, BancoReceptorOut, BancoReceptorPatch

router = APIRouter()


@router.get("/", response_model=list[BancoReceptorOut])
def listar_bancos(perms: tuple[User, Session] = require_permission("config", "view")):
    _, db = perms
    return db.query(BancoReceptor).order_by(BancoReceptor.nombre).all()


@router.post("/", response_model=BancoReceptorOut, status_code=status.HTTP_201_CREATED)
def crear_banco(body: BancoReceptorCreate, perms: tuple[User, Session] = require_permission("config", "edit")):
    _, db = perms
    banco = BancoReceptor(nombre=body.nombre.strip())
    db.add(banco)
    db.commit()
    db.refresh(banco)
    return banco


@router.patch("/{banco_id}", response_model=BancoReceptorOut)
def actualizar_banco(banco_id: int, body: BancoReceptorPatch, perms: tuple[User, Session] = require_permission("config", "edit")):
    _, db = perms
    banco = db.get(BancoReceptor, banco_id)
    if not banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(banco, field, value)
    db.commit()
    db.refresh(banco)
    return banco


@router.delete("/{banco_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_banco(banco_id: int, perms: tuple[User, Session] = require_permission("config", "edit")):
    _, db = perms
    banco = db.get(BancoReceptor, banco_id)
    if not banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    db.delete(banco)
    db.commit()
