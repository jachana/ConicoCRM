import csv
import html as _html
import io as _io
from collections.abc import Callable
from datetime import date
from decimal import Decimal

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select as sa_select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.cliente import Cliente as ClienteModel
from app.models.empresa import Empresa
from app.models.factura import Factura, FacturaLinea
from app.models.user import User
from app.schemas.empresa import (
    EmpresaCreate, EmpresaDeudaOut, EmpresaCreditoOut, EmpresaOut, EmpresaUpdate,
    FacturaResumen, EmpresaDeudaBulkItem, EmpresaListItem,
    EmpresaFacturaDetailItem, EmpresaProductoLineOut,
)


def _export_xlsx(headers: list[str], rows: list[list]) -> "StreamingResponse":
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = _io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=export.xlsx"},
    )


def _export_csv(headers: list[str], rows: list[list]) -> "StreamingResponse":
    output = _io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    buf = _io.BytesIO(output.getvalue().encode("utf-8-sig"))
    return StreamingResponse(
        buf,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=export.csv"},
    )


def _export_pdf(title: str, headers: list[str], rows: list[list]) -> "StreamingResponse":
    from weasyprint import HTML
    rows_html = "".join(
        "<tr>" + "".join(f"<td>{_html.escape(str(c))}</td>" for c in row) + "</tr>"
        for row in rows
    )
    html_str = f"""<html><head><style>
      body{{font-family:Arial,sans-serif;font-size:9px;}}
      h1{{font-size:13px;color:#0369a1;margin-bottom:8px;}}
      table{{width:100%;border-collapse:collapse;}}
      th{{background:#0369a1;color:white;padding:4px 8px;text-align:left;}}
      td{{padding:3px 8px;border-bottom:1px solid #e2e8f0;}}
      tr:nth-child(even) td{{background:#f8fafc;}}
    </style></head><body>
      <h1>{_html.escape(title)}</h1>
      <table><tr>{"".join(f"<th>{h}</th>" for h in headers)}</tr>{rows_html}</table>
    </body></html>"""
    buf = _io.BytesIO()
    HTML(string=html_str).write_pdf(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=export.pdf"},
    )


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
    ws.append(["ID", "Nombre", "Razón Social", "RUT", "Sector", "Email", "Ubicación"])
    for e in empresas:
        ws.append([
            e.id, e.nombre, e.razon_social or "", e.rut or "",
            e.sector or "", e.email or "", e.ubicacion or "",
        ])
    buf = _io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=empresas.xlsx"},
    )


@router.get("/", response_model=list[EmpresaListItem])
def listar_empresas(
    q: str = Query(""),
    sector: str | None = Query(None),
    producto_ids: list[int] = Query(default=[]),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms

    ultima_compra_subq = (
        sa_select(
            Factura.empresa_id,
            func.max(Factura.fecha).label("ultima_compra"),
        )
        .where(Factura.estado != "anulada", Factura.empresa_id.isnot(None))
        .group_by(Factura.empresa_id)
        .subquery()
    )

    query = db.query(Empresa, ultima_compra_subq.c.ultima_compra).outerjoin(
        ultima_compra_subq, ultima_compra_subq.c.empresa_id == Empresa.id
    )

    if q:
        like = f"%{q}%"
        query = query.filter(Empresa.nombre.ilike(like) | Empresa.rut.ilike(like))
    if sector:
        query = query.filter(Empresa.sector == sector)
    if producto_ids:
        producto_subq = (
            sa_select(Factura.empresa_id)
            .join(FacturaLinea, FacturaLinea.factura_id == Factura.id)
            .where(
                FacturaLinea.producto_id.in_(producto_ids),
                Factura.empresa_id.isnot(None),
                Factura.estado != "anulada",
            )
            .distinct()
            .subquery()
        )
        query = query.filter(Empresa.id.in_(sa_select(producto_subq.c.empresa_id)))

    rows = query.order_by(Empresa.nombre).all()
    result = []
    for empresa, ultima_compra in rows:
        item = EmpresaListItem.model_validate(
            {**empresa.__dict__, "ultima_compra": ultima_compra}
        )
        result.append(item)
    return result


@router.get("/sectores", response_model=list[str])
def listar_sectores(
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    rows = (
        db.query(Empresa.sector)
        .filter(Empresa.sector.isnot(None))
        .distinct()
        .order_by(Empresa.sector)
        .all()
    )
    return [r[0] for r in rows]


@router.get("/deuda-bulk", response_model=list[EmpresaDeudaBulkItem])
def deuda_bulk(
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    from datetime import date, timedelta
    from decimal import Decimal as D

    _, db = perms
    today = date.today()

    def _plazo_dias(plazo: str | None) -> int | None:
        if plazo == "30 Dias":
            return 30
        if plazo == "60 Dias":
            return 60
        if plazo == "90 Dias":
            return 90
        if plazo == "Al contado":
            return 0
        return None

    empresas = db.query(Empresa).order_by(Empresa.nombre).all()
    result = []
    for e in empresas:
        facturas = (
            db.query(Factura)
            .filter(Factura.empresa_id == e.id, Factura.estado != "anulada")
            .all()
        )
        deuda_total = D("0")
        deuda_vencida = D("0")
        dias = _plazo_dias(e.plazo_credito)

        for f in facturas:
            pendiente = f.total - (f.monto_pagado or D("0"))
            if pendiente <= 0:
                continue
            deuda_total += pendiente

            if f.fecha_vencimiento:
                due_date = f.fecha_vencimiento
            elif dias is not None:
                due_date = f.fecha + timedelta(days=dias)
            else:
                continue

            if due_date < today:
                deuda_vencida += pendiente

        result.append(
            EmpresaDeudaBulkItem(
                empresa_id=e.id,
                nombre=e.nombre,
                plazo_credito=e.plazo_credito,
                linea_credito=e.linea_credito,
                deuda_total=deuda_total,
                deuda_vencida=deuda_vencida,
            )
        )
    return result


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


@router.get("/{empresa_id}/credito", response_model=EmpresaCreditoOut)
def credito_empresa(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    if e.linea_credito is None:
        return EmpresaCreditoOut(linea_credito=None, credito_usado=None, credito_disponible=None)
    from decimal import Decimal as D
    facturas = (
        db.query(Factura)
        .filter(Factura.empresa_id == empresa_id, Factura.estado != "anulada")
        .all()
    )
    credito_usado = sum(
        (f.total - (f.monto_pagado or D("0")) for f in facturas
         if f.total - (f.monto_pagado or D("0")) > 0),
        D("0"),
    )
    credito_disponible = e.linea_credito - credito_usado
    return EmpresaCreditoOut(
        linea_credito=e.linea_credito,
        credito_usado=credito_usado,
        credito_disponible=credito_disponible,
    )


@router.get("/{empresa_id}/facturas", response_model=list[EmpresaFacturaDetailItem])
def facturas_empresa(
    empresa_id: int,
    estado: list[str] = Query(default=[]),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    sort_by: str = Query("fecha"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    query = db.query(Factura).filter(Factura.empresa_id == empresa_id)
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


@router.get("/{empresa_id}/productos", response_model=list[EmpresaProductoLineOut])
def productos_empresa(
    empresa_id: int,
    q: str = Query(""),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    sort_by: str = Query("fecha"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    query = (
        db.query(FacturaLinea, Factura.fecha, Factura.id, Factura.numero)
        .join(Factura, Factura.id == FacturaLinea.factura_id)
        .filter(
            Factura.empresa_id == empresa_id,
            Factura.estado != "anulada",
        )
    )
    if q:
        like = f"%{q}%"
        query = query.filter(
            FacturaLinea.descripcion.ilike(like) | FacturaLinea.sku.ilike(like)
        )
    if fecha_desde:
        query = query.filter(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Factura.fecha <= fecha_hasta)

    sort_map = {
        "fecha": Factura.fecha,
        "sku": FacturaLinea.sku,
        "descripcion": FacturaLinea.descripcion,
        "cantidad": FacturaLinea.cantidad,
        "precio_unit": FacturaLinea.valor_neto,
        "total_neto": FacturaLinea.total_neto,
    }
    sort_col = sort_map.get(sort_by, Factura.fecha)
    query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

    rows = query.all()
    return [
        EmpresaProductoLineOut(
            fecha=fecha,
            factura_id=factura_id,
            factura_numero=factura_numero,
            sku=linea.sku,
            descripcion=linea.descripcion,
            cantidad=linea.cantidad,
            precio_unit=linea.valor_neto,
            total_neto=linea.total_neto,
        )
        for linea, fecha, factura_id, factura_numero in rows
    ]


@router.get("/{empresa_id}/export/facturas")
def exportar_facturas_empresa(
    empresa_id: int,
    format: str = Query("xlsx"),
    estado: list[str] = Query(default=[]),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    columns: list[str] = Query(default=[]),
    send_to: str | None = Query(None),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    if send_to:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Envío por email/WhatsApp pendiente de implementación")
    if format not in ("xlsx", "csv", "pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="format debe ser xlsx, csv o pdf")

    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    query = db.query(Factura).filter(Factura.empresa_id == empresa_id)
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
    facturas = query.order_by(Factura.fecha.desc()).all()

    ALL_COLS: dict[str, tuple[str, Callable]] = {
        "numero":       ("Nº",        lambda f: f.numero),
        "fecha":        ("Fecha",     lambda f: str(f.fecha)),
        "estado":       ("Estado",    lambda f: f.estado),
        "contacto":     ("Contacto",  lambda f: f.contacto or ""),
        "total":        ("Total",     lambda f: float(f.total)),
        "monto_pagado": ("Pagado",    lambda f: float(f.monto_pagado or Decimal("0"))),
        "pendiente":    ("Pendiente", lambda f: float(f.total - (f.monto_pagado or Decimal("0")))),
    }
    selected = [k for k in (columns or list(ALL_COLS.keys())) if k in ALL_COLS]
    if not selected:
        selected = list(ALL_COLS.keys())

    headers = [ALL_COLS[k][0] for k in selected]
    data_rows = [[ALL_COLS[k][1](f) for k in selected] for f in facturas]

    if format == "csv":
        return _export_csv(headers, data_rows)
    if format == "pdf":
        return _export_pdf(f"Facturas — {e.nombre}", headers, data_rows)
    return _export_xlsx(headers, data_rows)


@router.get("/{empresa_id}/export/productos")
def exportar_productos_empresa(
    empresa_id: int,
    format: str = Query("xlsx"),
    q: str = Query(""),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    columns: list[str] = Query(default=[]),
    send_to: str | None = Query(None),
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    if send_to:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Envío por email/WhatsApp pendiente de implementación")
    if format not in ("xlsx", "csv", "pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="format debe ser xlsx, csv o pdf")

    _, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    query = (
        db.query(FacturaLinea, Factura.fecha, Factura.id, Factura.numero)
        .join(Factura, Factura.id == FacturaLinea.factura_id)
        .filter(Factura.empresa_id == empresa_id, Factura.estado != "anulada")
    )
    if q:
        like = f"%{q}%"
        query = query.filter(FacturaLinea.descripcion.ilike(like) | FacturaLinea.sku.ilike(like))
    if fecha_desde:
        query = query.filter(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Factura.fecha <= fecha_hasta)
    rows = query.order_by(Factura.fecha.desc()).all()

    ALL_COLS: dict[str, tuple[str, Callable]] = {
        "fecha":          ("Fecha",       lambda r: str(r[1])),
        "factura_numero": ("Nº Factura",  lambda r: r[3]),
        "sku":            ("SKU",         lambda r: r[0].sku or ""),
        "descripcion":    ("Descripción", lambda r: r[0].descripcion),
        "cantidad":       ("Cantidad",    lambda r: float(r[0].cantidad)),
        "precio_unit":    ("Precio Unit", lambda r: float(r[0].valor_neto)),
        "total_neto":     ("Total",       lambda r: float(r[0].total_neto)),
    }
    selected = [k for k in (columns or list(ALL_COLS.keys())) if k in ALL_COLS]
    if not selected:
        selected = list(ALL_COLS.keys())

    headers = [ALL_COLS[k][0] for k in selected]
    data_rows = [[ALL_COLS[k][1](r) for k in selected] for r in rows]

    if format == "csv":
        return _export_csv(headers, data_rows)
    if format == "pdf":
        return _export_pdf(f"Productos — {e.nombre}", headers, data_rows)
    return _export_xlsx(headers, data_rows)


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
    user, db = perms
    e = db.get(Empresa, empresa_id)
    if not e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    datos = body.model_dump(exclude_unset=True)
    if "rut" in datos and datos["rut"] != e.rut:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El RUT no puede modificarse después de creada la empresa")
    if "linea_credito" in datos and user.role == "vendedor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administradores pueden modificar la línea de crédito")
    for field, value in datos.items():
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
