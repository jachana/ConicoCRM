import re
from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.database import get_db
from app.models.factura import Factura, FacturaLinea
from app.models.nota_venta import NotaVenta
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.factura import (
    FacturaCreate,
    FacturaEstadoCambio,
    FacturaLineaCreate,
    FacturaListOut,
    FacturaOut,
    FacturaUpdate,
)
from app.services.email import EmailNotConfiguredError, enviar_factura
from app.services.pdf import generar_pdf_factura

router = APIRouter()

_TRANSITIONS: dict[tuple[str, str], str] = {
    ("emitida", "pagada"):  "admin",
    ("emitida", "anulada"): "admin",
    ("pagada",  "anulada"): "admin_only",
}

_METODOS_PAGO = {"efectivo", "transferencia", "cheque", "debito", "credito", "deposito"}


def _get_config_dict(db: Session) -> dict:
    return {r.key: r.value for r in db.query(SystemConfig).all()}


def _asignar_numero_factura(db: Session) -> int:
    config = (
        db.query(SystemConfig)
        .filter_by(key="factura_last_id")
        .with_for_update()
        .first()
    )
    if not config:
        config = SystemConfig(key="factura_last_id", value="0")
        db.add(config)
        db.flush()
    numero = int(config.value) + 1
    config.value = str(numero)
    return numero


def _calcular_lineas(db: Session, lineas_data: list[FacturaLineaCreate]) -> list[FacturaLinea]:
    lineas = []
    for data in lineas_data:
        total_neto = data.cantidad * data.valor_neto
        iva = total_neto * Decimal("0.19")
        total = total_neto + iva
        margen = None
        if data.producto_id:
            producto = db.get(Producto, data.producto_id)
            if producto and data.valor_neto > 0:
                margen = (data.valor_neto - producto.precio_costo) / data.valor_neto
        lineas.append(FacturaLinea(
            orden=data.orden,
            producto_id=data.producto_id,
            sku=data.sku,
            descripcion=data.descripcion,
            formato=data.formato,
            cantidad=data.cantidad,
            valor_neto=data.valor_neto,
            total_neto=total_neto,
            iva=iva,
            total=total,
            margen=margen,
        ))
    return lineas


def _recalcular_totales(factura: Factura) -> None:
    factura.total_neto = sum(l.total_neto for l in factura.lineas)
    factura.total_iva = sum(l.iva for l in factura.lineas)
    factura.total = sum(l.total for l in factura.lineas)


def _load_factura(db: Session, factura_id: int) -> Factura:
    factura = db.query(Factura).options(
        joinedload(Factura.cliente),
        joinedload(Factura.vendedor),
        joinedload(Factura.empresa),
        joinedload(Factura.cotizacion),
        joinedload(Factura.nv),
        joinedload(Factura.lineas),
    ).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    return factura


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    facturas = (
        db.query(Factura)
        .options(joinedload(Factura.cliente), joinedload(Factura.vendedor))
        .order_by(Factura.numero.desc())
        .all()
    )
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Facturas"
    ws.append(["Nº FAC", "Fecha", "Vencimiento", "Cliente", "Contacto", "Total Neto", "IVA", "Total", "Estado", "Encargado"])
    for f in facturas:
        ws.append([
            f.numero,
            f.fecha.strftime("%d/%m/%Y") if f.fecha else "",
            f.fecha_vencimiento.strftime("%d/%m/%Y") if f.fecha_vencimiento else "",
            f.cliente.nombre if f.cliente else "",
            f.contacto or "",
            float(f.total_neto),
            float(f.total_iva),
            float(f.total),
            f.estado,
            f.vendedor.name if f.vendedor else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=facturas.xlsx"},
    )


@router.get("/", response_model=list[FacturaListOut])
def listar_facturas(
    estado: str | None = Query(None),
    cliente_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    q = db.query(Factura).options(
        joinedload(Factura.cliente),
        joinedload(Factura.vendedor),
        joinedload(Factura.empresa),
    )
    if estado:
        q = q.filter(Factura.estado == estado)
    if cliente_id:
        q = q.filter(Factura.cliente_id == cliente_id)
    if fecha_desde:
        q = q.filter(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Factura.fecha <= fecha_hasta)
    return q.order_by(Factura.numero.desc()).all()


@router.post("/", response_model=FacturaOut, status_code=status.HTTP_201_CREATED)
def crear_factura(
    body: FacturaCreate,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede crear facturas")
    numero = _asignar_numero_factura(db)
    factura = Factura(
        numero=numero,
        cliente_id=body.cliente_id,
        vendedor_id=body.vendedor_id,
        contacto=body.contacto,
        fecha=body.fecha or date.today(),
        fecha_vencimiento=body.fecha_vencimiento,
        nota=body.nota,
        correo=body.correo,
        empresa_id=body.empresa_id,
    )
    db.add(factura)
    db.flush()
    factura.lineas = _calcular_lineas(db, body.lineas)
    for linea in factura.lineas:
        linea.factura_id = factura.id
    _recalcular_totales(factura)
    db.commit()
    return _load_factura(db, factura.id)


@router.post("/from_nv/{nv_id}", response_model=FacturaOut, status_code=status.HTTP_201_CREATED)
def crear_factura_desde_nv(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede crear facturas")

    nv = db.query(NotaVenta).options(
        joinedload(NotaVenta.lineas),
        joinedload(NotaVenta.factura),
    ).filter(NotaVenta.id == nv_id).first()
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    if nv.factura is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta nota de venta ya tiene una factura generada",
        )

    numero = _asignar_numero_factura(db)
    factura = Factura(
        numero=numero,
        nv_id=nv.id,
        cotizacion_id=nv.cotizacion_id,
        cliente_id=nv.cliente_id,
        empresa_id=nv.empresa_id,
        vendedor_id=nv.vendedor_id,
        contacto=nv.contacto,
        fecha=date.today(),
        nota=nv.nota,
        correo=nv.correo,
    )
    db.add(factura)
    db.flush()

    lineas = []
    for nl in nv.lineas:
        lineas.append(FacturaLinea(
            factura_id=factura.id,
            orden=nl.orden,
            producto_id=nl.producto_id,
            sku=nl.sku,
            descripcion=nl.descripcion,
            formato=nl.formato,
            cantidad=nl.cantidad,
            valor_neto=nl.valor_neto,
            total_neto=nl.total_neto,
            iva=nl.iva,
            total=nl.total,
            margen=nl.margen,
        ))
    factura.lineas = lineas
    _recalcular_totales(factura)
    db.commit()
    return _load_factura(db, factura.id)


@router.get("/{factura_id}", response_model=FacturaOut)
def obtener_factura(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    return _load_factura(db, factura_id)


@router.patch("/{factura_id}", response_model=FacturaOut)
def actualizar_factura(
    factura_id: int,
    body: FacturaUpdate,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede editar facturas")
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(factura, field, value)
    db.commit()
    return _load_factura(db, factura_id)


@router.put("/{factura_id}/lineas", response_model=FacturaOut)
def reemplazar_lineas(
    factura_id: int,
    lineas_data: list[FacturaLineaCreate],
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    current_user, db = perms
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede editar líneas de factura")
    factura = db.query(Factura).options(joinedload(Factura.lineas)).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    for linea in list(factura.lineas):
        db.delete(linea)
    db.flush()
    nuevas = _calcular_lineas(db, lineas_data)
    for linea in nuevas:
        linea.factura_id = factura_id
        db.add(linea)
    db.flush()
    factura.lineas = nuevas
    _recalcular_totales(factura)
    factura.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _load_factura(db, factura_id)


@router.patch("/{factura_id}/estado", response_model=FacturaOut)
def cambiar_estado(
    factura_id: int,
    body: FacturaEstadoCambio,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede cambiar estado")
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")

    transition = (factura.estado, body.estado)
    allowed = _TRANSITIONS.get(transition)
    if allowed is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Transición '{factura.estado}' → '{body.estado}' no permitida",
        )
    if allowed == "admin_only" and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede hacer esta transición")

    if body.estado == "pagada":
        if not body.fecha_pago or body.monto_pagado is None or not body.metodo_pago:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Para marcar como pagada se requiere fecha_pago, monto_pagado y metodo_pago",
            )
        if body.metodo_pago not in _METODOS_PAGO:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"metodo_pago inválido. Valores: {', '.join(sorted(_METODOS_PAGO))}",
            )
        factura.fecha_pago = body.fecha_pago
        factura.monto_pagado = body.monto_pagado
        factura.metodo_pago = body.metodo_pago

    factura.estado = body.estado
    db.commit()
    return _load_factura(db, factura_id)


@router.delete("/{factura_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_factura(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "delete"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede eliminar facturas")
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    if factura.estado != "emitida":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden eliminar facturas en estado 'emitida'",
        )
    db.delete(factura)
    db.commit()


@router.get("/{factura_id}/pdf")
def generar_pdf(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    factura = _load_factura(db, factura_id)
    config = _get_config_dict(db)
    pdf_bytes = generar_pdf_factura(factura, config)
    cliente_nombre = factura.cliente.nombre if factura.cliente else "cliente"
    raw_filename = f"FAC - {factura.numero} {factura.fecha}.{factura.contacto or ''}. {cliente_nombre}.pdf"
    filename = re.sub(r'[^\w\s\-.]', '_', raw_filename)
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{factura_id}/email")
def enviar_email(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    factura = _load_factura(db, factura_id)
    config = _get_config_dict(db)
    try:
        pdf_bytes = generar_pdf_factura(factura, config)
        enviar_factura(factura, pdf_bytes)
    except EmailNotConfiguredError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error al enviar email: {e}")
    return {"detail": "Email enviado correctamente"}
