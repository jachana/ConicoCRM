from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.proveedor import Proveedor
from app.models.user import User
from app.schemas.proveedor import ProveedorCreate, ProveedorOut, ProveedorUpdate

router = APIRouter()


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("proveedores", "view"),
):
    current_user, db = perms
    proveedores = db.query(Proveedor).order_by(Proveedor.nombre).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Proveedores"
    ws.append(["ID", "Nombre", "RUT", "Contacto", "Email", "Teléfono", "Notas"])
    for p in proveedores:
        ws.append([p.id, p.nombre, p.rut or "", p.contacto or "", p.email or "", p.telefono or "", p.notas or ""])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=proveedores.xlsx"},
    )


@router.get("/", response_model=list[ProveedorOut])
def listar_proveedores(
    perms: tuple[User, Session] = require_permission("proveedores", "view"),
):
    _, db = perms
    return db.query(Proveedor).order_by(Proveedor.nombre).all()


@router.post("/", response_model=ProveedorOut, status_code=status.HTTP_201_CREATED)
def crear_proveedor(
    body: ProveedorCreate,
    perms: tuple[User, Session] = require_permission("proveedores", "create"),
):
    _, db = perms
    proveedor = Proveedor(**body.model_dump())
    db.add(proveedor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(proveedor)
    return proveedor


@router.get("/{proveedor_id}", response_model=ProveedorOut)
def obtener_proveedor(
    proveedor_id: int,
    perms: tuple[User, Session] = require_permission("proveedores", "view"),
):
    _, db = perms
    p = db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    return p


@router.patch("/{proveedor_id}", response_model=ProveedorOut)
def actualizar_proveedor(
    proveedor_id: int,
    body: ProveedorUpdate,
    perms: tuple[User, Session] = require_permission("proveedores", "edit"),
):
    _, db = perms
    p = db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(p)
    return p


@router.delete("/{proveedor_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_proveedor(
    proveedor_id: int,
    perms: tuple[User, Session] = require_permission("proveedores", "delete"),
):
    _, db = perms
    p = db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    db.delete(p)
    db.commit()
