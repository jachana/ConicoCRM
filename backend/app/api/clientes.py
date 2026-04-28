from datetime import date
from decimal import Decimal
from io import BytesIO

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.models.cliente import Cliente
from app.models.factura import Factura
from app.models.user import User
from app.schemas.cliente import ClienteCreate, ClienteOut, ClienteUpdate
from app.schemas.empresa import EmpresaFacturaDetailItem

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


@router.get("/{cliente_id}/facturas", response_model=list[EmpresaFacturaDetailItem])
def facturas_cliente(
    cliente_id: int,
    estado: list[str] = Query(default=[]),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    sort_by: str = Query("fecha"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    """Facturas del cliente para el tab Facturas en ClienteDetailModal.

    Mirrors GET /api/empresas/{id}/facturas — same filters, same shape.
    Vendedor scope: ve sólo facturas propias (vendedor_id == current_user.id).
    """
    current_user, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    query = db.query(Factura).filter(Factura.cliente_id == cliente_id)
    if current_user.role == "vendedor":
        query = query.filter(Factura.vendedor_id == current_user.id)
    if estado:
        query = query.filter(Factura.estado.in_(estado))
    if fecha_desde:
        query = query.filter(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Factura.fecha <= fecha_hasta)
    if monto_min is not None:
        query = query.filter(Factura.total >= monto_min)
    if monto_max is not None:
        query = query.filter(Factura.total <= monto_max)

    sort_col = {
        "fecha": Factura.fecha,
        "numero": Factura.numero,
        "total": Factura.total,
        "estado": Factura.estado,
        "pendiente": Factura.total,
        "monto_pagado": Factura.monto_pagado,
    }.get(sort_by, Factura.fecha)
    query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

    facturas = query.all()
    return [
        EmpresaFacturaDetailItem(
            id=f.id,
            numero=f.numero,
            fecha=f.fecha,
            estado=f.estado,
            contacto=f.contacto,
            total=f.total,
            monto_pagado=f.monto_pagado or Decimal("0"),
            pendiente=f.total - (f.monto_pagado or Decimal("0")),
        )
        for f in facturas
    ]
