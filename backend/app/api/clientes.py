from io import BytesIO

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.models.cliente import Cliente
from app.models.user import User
from app.schemas.cliente import ClienteCreate, ClienteOut, ClienteUpdate

router = APIRouter()


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    _, db = perms
    clientes = db.query(Cliente).options(joinedload(Cliente.empresa)).order_by(Cliente.nombre).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Clientes"
    ws.append(["ID", "Nombre", "RUT", "Email", "Teléfono", "Empresa", "Dirección Despacho", "Notas"])
    for c in clientes:
        ws.append([
            c.id, c.nombre, c.rut or "", c.email or "", c.telefono or "",
            c.empresa.nombre if c.empresa else "",
            c.direccion_despacho or "", c.notas or "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=clientes.xlsx"},
    )


@router.get("/", response_model=list[ClienteOut])
def listar_clientes(
    q: str = Query("", description="Filtrar por nombre o RUT"),
    empresa_id: int | None = Query(None),
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    _, db = perms
    query = db.query(Cliente)
    if q:
        query = query.filter(Cliente.nombre.ilike(f"%{q}%") | Cliente.rut.ilike(f"%{q}%"))
    if empresa_id is not None:
        query = query.filter(Cliente.empresa_id == empresa_id)
    return query.order_by(Cliente.nombre).all()


@router.post("/", response_model=ClienteOut, status_code=status.HTTP_201_CREATED)
def crear_cliente(
    body: ClienteCreate,
    perms: tuple[User, Session] = require_permission("clientes", "create"),
):
    _, db = perms
    cliente = Cliente(**body.model_dump())
    db.add(cliente)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(cliente)
    return cliente


@router.get("/{cliente_id}", response_model=ClienteOut)
def obtener_cliente(
    cliente_id: int,
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    _, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    return c


@router.patch("/{cliente_id}", response_model=ClienteOut)
def actualizar_cliente(
    cliente_id: int,
    body: ClienteUpdate,
    perms: tuple[User, Session] = require_permission("clientes", "edit"),
):
    _, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(c, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(c)
    return c


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cliente(
    cliente_id: int,
    perms: tuple[User, Session] = require_permission("clientes", "delete"),
):
    _, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    db.delete(c)
    db.commit()
