from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from app.api.deps import require_permission
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion
from app.models.empresa import Empresa
from app.models.nota_alerta import NotaAlerta
from app.models.nota_venta import NotaVenta
from app.utils.search import unaccent_ilike
from app.models.factura import Factura
from app.models.user import User
from app.schemas.cliente import ClienteCreate, ClienteOut, ClienteUpdate
from app.schemas.empresa import EmpresaFacturaDetailItem, VentaDocItem
from app.schemas.nota_alerta import NotaAlertaOut

router = APIRouter()


def _vendedor_cliente_filter(query, user: User):
    """Restrict to clientes assigned to vendedor (directly or via empresa)."""
    return query.outerjoin(Empresa, Empresa.id == Cliente.empresa_id).filter(
        or_(Cliente.vendedor_id == user.id, Empresa.vendedor_id == user.id)
    )


def _enforce_cliente_scope(c: Cliente, user: User, db: Session) -> None:
    """Raise 403 if vendedor accesses a cliente not assigned (directly or via empresa)."""
    if user.role != "vendedor":
        return
    if c.vendedor_id == user.id:
        return
    if c.empresa_id is not None:
        emp = db.get(Empresa, c.empresa_id)
        if emp is not None and emp.vendedor_id == user.id:
            return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes acceso a este cliente",
    )


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    current_user, db = perms
    clientes_q = db.query(Cliente).options(joinedload(Cliente.empresa))
    if current_user.role == "vendedor":
        clientes_q = _vendedor_cliente_filter(clientes_q, current_user)
    clientes = clientes_q.order_by(Cliente.nombre).all()
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
    current_user, db = perms
    query = db.query(Cliente).options(joinedload(Cliente.vendedor))
    is_vendedor = current_user.role == "vendedor"
    if is_vendedor:
        query = _vendedor_cliente_filter(query, current_user)
    if q:
        if not is_vendedor:
            query = query.outerjoin(Cliente.empresa)
        query = query.filter(
            unaccent_ilike(Cliente.nombre, f"%{q}%")
            | Cliente.rut.ilike(f"%{q}%")
            | unaccent_ilike(Empresa.nombre, f"%{q}%")
            | unaccent_ilike(Empresa.razon_social, f"%{q}%")
        )
    if empresa_id is not None:
        query = query.filter(Cliente.empresa_id == empresa_id)
    return query.order_by(Cliente.nombre).all()


@router.post("/", response_model=ClienteOut, status_code=status.HTTP_201_CREATED)
def crear_cliente(
    body: ClienteCreate,
    perms: tuple[User, Session] = require_permission("clientes", "create"),
):
    current_user, db = perms
    if current_user.role == "vendedor" and body.vendedor_id not in (None, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes asignar el cliente a otro vendedor",
        )
    data = body.model_dump()
    if current_user.role == "vendedor":
        data["vendedor_id"] = current_user.id
    cliente = Cliente(**data)
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
    current_user, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    _enforce_cliente_scope(c, current_user, db)
    return c


@router.patch("/{cliente_id}", response_model=ClienteOut)
def actualizar_cliente(
    cliente_id: int,
    body: ClienteUpdate,
    perms: tuple[User, Session] = require_permission("clientes", "edit"),
):
    current_user, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    _enforce_cliente_scope(c, current_user, db)
    datos = body.model_dump(exclude_unset=True)
    if (
        "vendedor_id" in datos
        and current_user.role == "vendedor"
        and datos["vendedor_id"] != c.vendedor_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden reasignar el vendedor",
        )
    for field, value in datos.items():
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
    current_user, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    _enforce_cliente_scope(c, current_user, db)
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
    _enforce_cliente_scope(c, current_user, db)

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


@router.get("/{cliente_id}/cotizaciones", response_model=list[VentaDocItem])
def cotizaciones_cliente(
    cliente_id: int,
    estado: list[str] = Query(default=[]),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    sort_by: str = Query("fecha"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    """Cotizaciones del cliente para el tab Ventas en ClienteDetailModal."""
    current_user, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    _enforce_cliente_scope(c, current_user, db)

    query = db.query(Cotizacion).filter(Cotizacion.cliente_id == cliente_id)
    if estado:
        query = query.filter(Cotizacion.estado.in_(estado))
    if fecha_desde:
        query = query.filter(Cotizacion.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Cotizacion.fecha <= fecha_hasta)

    sort_col = {
        "fecha": Cotizacion.fecha,
        "numero": Cotizacion.numero,
        "total": Cotizacion.total,
        "estado": Cotizacion.estado,
    }.get(sort_by, Cotizacion.fecha)
    query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    return query.all()


@router.get("/{cliente_id}/nota-ventas", response_model=list[VentaDocItem])
def nota_ventas_cliente(
    cliente_id: int,
    estado: list[str] = Query(default=[]),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    sort_by: str = Query("fecha"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    """Notas de venta del cliente para el tab Ventas en ClienteDetailModal."""
    current_user, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    _enforce_cliente_scope(c, current_user, db)

    query = db.query(NotaVenta).filter(NotaVenta.cliente_id == cliente_id)
    if estado:
        query = query.filter(NotaVenta.estado.in_(estado))
    if fecha_desde:
        query = query.filter(NotaVenta.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(NotaVenta.fecha <= fecha_hasta)

    sort_col = {
        "fecha": NotaVenta.fecha,
        "numero": NotaVenta.numero,
        "total": NotaVenta.total,
        "estado": NotaVenta.estado,
    }.get(sort_by, NotaVenta.fecha)
    query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    return query.all()


@router.get("/{cliente_id}/notes", response_model=list[NotaAlertaOut])
def notas_cliente(
    cliente_id: int,
    tipo: list[str] = Query(default=[]),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    """Retrieve active notes/alerts for a customer.

    Returns all alert notes associated with the customer's quotations,
    filtered and sorted as specified.

    - Vendedor scope: sees only notes from their own quotations (vendedor_id == current_user.id).
    - Filters: tipo (cobranza/crédito/custom)
    - Only vigentes (non-expired) notes: expires_at IS NULL OR expires_at > now()
    - Sort: by created_at (DESC default) or updated_at
    """
    current_user, db = perms
    c = db.get(Cliente, cliente_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    _enforce_cliente_scope(c, current_user, db)

    # Get quotation IDs for this customer using a subquery (avoid N+1 query)
    cot_subquery = db.query(Cotizacion.id).filter(Cotizacion.cliente_id == cliente_id)
    if current_user.role == "vendedor":
        cot_subquery = cot_subquery.filter(Cotizacion.vendedor_id == current_user.id)

    # Query notes for those quotations using subquery
    query = db.query(NotaAlerta)
    query = query.filter(NotaAlerta.cotizacion_id.in_(cot_subquery))

    # Filter by tipo (cobranza, crédito, custom)
    if tipo:
        query = query.filter(NotaAlerta.tipo.in_(tipo))

    # Filter only non-expired notes (expires_at IS NULL OR expires_at > now())
    now = datetime.now(timezone.utc)
    query = query.filter(
        or_(
            NotaAlerta.expires_at.is_(None),
            NotaAlerta.expires_at > now
        )
    )

    # Sort
    sort_col = {
        "created_at": NotaAlerta.created_at,
        "updated_at": NotaAlerta.updated_at,
    }.get(sort_by, NotaAlerta.created_at)
    query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

    notas = query.all()
    return notas
