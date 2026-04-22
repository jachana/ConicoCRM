from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import require_permission
from app.models.tag import ProductoTag
from app.models.user import User
from app.schemas.tag import TagCreate, TagOut

router = APIRouter()


@router.get("/", response_model=list[TagOut])
def listar_tags(perms: tuple[User, Session] = require_permission("catalogo", "view")):
    _, db = perms
    return db.query(ProductoTag).order_by(ProductoTag.nombre).all()


@router.post("/", response_model=TagOut, status_code=status.HTTP_201_CREATED)
def crear_tag(body: TagCreate, perms: tuple[User, Session] = require_permission("catalogo", "create")):
    _, db = perms
    nombre = body.nombre.strip().lower()
    existing = db.query(ProductoTag).filter(ProductoTag.nombre == nombre).first()
    if existing:
        return existing
    tag = ProductoTag(nombre=nombre)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_tag(tag_id: int, perms: tuple[User, Session] = require_permission("catalogo", "delete")):
    _, db = perms
    tag = db.get(ProductoTag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag no encontrada")
    db.delete(tag)
    db.commit()
