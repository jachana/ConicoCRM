from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.permissions import has_permission
from app.database import get_db
from app.models.proveedor import Proveedor
from app.models.user import User
from app.schemas.proveedor import ProveedorCreate, ProveedorOut, ProveedorUpdate

router = APIRouter()


def _verificar_permiso(db: Session, user: User, action: str) -> None:
    if not has_permission(db, user, "proveedores", action):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


@router.get("/export/excel")
def exportar_excel(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    return db.query(Proveedor).order_by(Proveedor.nombre).all()


@router.post("/", response_model=ProveedorOut, status_code=status.HTTP_201_CREATED)
def crear_proveedor(
    body: ProveedorCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "create")
    if body.rut:
        if db.query(Proveedor).filter_by(rut=body.rut).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    proveedor = Proveedor(**body.model_dump())
    db.add(proveedor)
    db.commit()
    db.refresh(proveedor)
    return proveedor


@router.get("/{proveedor_id}", response_model=ProveedorOut)
def obtener_proveedor(
    proveedor_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "view")
    p = db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    return p


@router.patch("/{proveedor_id}", response_model=ProveedorOut)
def actualizar_proveedor(
    proveedor_id: int,
    body: ProveedorUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "edit")
    p = db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{proveedor_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_proveedor(
    proveedor_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _verificar_permiso(db, current_user, "delete")
    p = db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    db.delete(p)
    db.commit()
