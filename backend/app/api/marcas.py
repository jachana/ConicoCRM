from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.api.deps import require_permission
from app.models.marca import Marca
from app.models.user import User
from app.schemas.marca import MarcaCreate, MarcaOut, MarcaUpdate

router = APIRouter()


@router.get("/", response_model=list[MarcaOut])
def listar_marcas(
    perms: tuple[User, Session] = require_permission("catalogo", "view"),
):
    _, db = perms
    return db.query(Marca).order_by(Marca.nombre).all()


@router.post("/", response_model=MarcaOut, status_code=status.HTTP_201_CREATED)
def crear_marca(
    body: MarcaCreate,
    perms: tuple[User, Session] = require_permission("catalogo", "edit"),
):
    _, db = perms
    marca = Marca(nombre=body.nombre.strip())
    db.add(marca)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una marca con ese nombre")
    db.refresh(marca)
    return marca


@router.patch("/{marca_id}", response_model=MarcaOut)
def actualizar_marca(
    marca_id: int,
    body: MarcaUpdate,
    perms: tuple[User, Session] = require_permission("catalogo", "edit"),
):
    _, db = perms
    marca = db.get(Marca, marca_id)
    if not marca:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Marca no encontrada")
    if body.nombre is not None:
        marca.nombre = body.nombre.strip()
    if body.activa is not None:
        marca.activa = body.activa
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una marca con ese nombre")
    db.refresh(marca)
    return marca
