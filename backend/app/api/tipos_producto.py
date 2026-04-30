from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.api.deps import require_permission
from app.models.tipo_producto import TipoProducto
from app.models.user import User
from app.schemas.tipo_producto import TipoProductoCreate, TipoProductoOut

router = APIRouter()


@router.get("/", response_model=list[TipoProductoOut])
def listar_tipos(perms: tuple[User, Session] = require_permission("catalogo", "view")):
    _, db = perms
    return db.query(TipoProducto).order_by(TipoProducto.nombre).all()


@router.post("/", response_model=TipoProductoOut, status_code=status.HTTP_201_CREATED)
def crear_tipo(
    body: TipoProductoCreate,
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    nombre = body.nombre.strip().lower()
    if not nombre:
        raise HTTPException(status_code=400, detail="Nombre requerido")
    existing = db.query(TipoProducto).filter(TipoProducto.nombre == nombre).first()
    if existing:
        return existing
    tipo = TipoProducto(nombre=nombre)
    db.add(tipo)
    db.commit()
    db.refresh(tipo)
    return tipo


@router.delete("/{tipo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_tipo(
    tipo_id: int,
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    tipo = db.get(TipoProducto, tipo_id)
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo no encontrado")
    db.delete(tipo)
    db.commit()
