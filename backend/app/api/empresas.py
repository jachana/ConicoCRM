from io import BytesIO

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.cliente import Cliente as ClienteModel
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.user import User
from app.schemas.empresa import EmpresaCreate, EmpresaDeudaOut, EmpresaOut, EmpresaUpdate, FacturaResumen

router = APIRouter()


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    empresas = db.query(Empresa).order_by(Empresa.nombre).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Empresas"
    ws.append(["ID", "Nombre", "Razón Social", "RUT", "Forma Pago", "Prioridad", "Sector", "Email", "Ubicación"])
    for e in empresas:
        ws.append([
            e.id, e.nombre, e.razon_social or "", e.rut or "",
            e.forma_pago or "", e.prioridad or "", e.sector or "",
            e.email or "", e.ubicacion or "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=empresas.xlsx"},
    )


@router.get("/", response_model=list[EmpresaOut])
def listar_empresas(
    q: str = Query(""),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    query = db.query(Empresa)
    if q:
        like = f"%{q}%"
        query = query.filter(Empresa.nombre.ilike(like) | Empresa.rut.ilike(like))
    return query.order_by(Empresa.nombre).all()


@router.post("/", response_model=EmpresaOut, status_code=status.HTTP_201_CREATED)
def crear_empresa(
    body: EmpresaCreate,
    perms: tuple[User, Session] = require_permission("empresas", "create"),
):
    _, db = perms
    empresa = Empresa(**body.model_dump())
    db.add(empresa)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(empresa)
    return empresa


@router.get("/{empresa_id}/deuda", response_model=EmpresaDeudaOut)
def deuda_empresa(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    facturas = (
        db.query(Factura)
        .filter(Factura.empresa_id == empresa_id, Factura.estado != "anulada")
        .order_by(Factura.fecha.desc())
        .all()
    )
    from decimal import Decimal as D
    total_facturado = sum((f.total for f in facturas), D("0"))
    total_pagado = sum((f.monto_pagado or D("0") for f in facturas), D("0"))
    return EmpresaDeudaOut(
        total_facturado=total_facturado,
        total_pagado=total_pagado,
        deuda=total_facturado - total_pagado,
        facturas=[
            FacturaResumen(
                id=f.id,
                numero=f.numero,
                fecha=f.fecha,
                contacto=f.contacto,
                total=f.total,
                monto_pagado=f.monto_pagado or D("0"),
                estado=f.estado,
            )
            for f in facturas
        ],
    )


@router.get("/{empresa_id}", response_model=EmpresaOut)
def obtener_empresa(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return e


@router.patch("/{empresa_id}", response_model=EmpresaOut)
def actualizar_empresa(
    empresa_id: int,
    body: EmpresaUpdate,
    perms: tuple[User, Session] = require_permission("empresas", "edit"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(e, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="RUT ya registrado")
    db.refresh(e)
    return e


@router.delete("/{empresa_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_empresa(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "delete"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    has_clientes = db.query(ClienteModel.id).filter(ClienteModel.empresa_id == empresa_id).first()
    if has_clientes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar: tiene clientes asociados",
        )
    db.delete(e)
    db.commit()
