import re
from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.api.deps import require_permission
from app.database import get_db
from app.models.cotizacion import Cotizacion
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.nota_venta import NotaVenta, NotaVentaLinea
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.nota_venta import (
    EstadoCambio,
    NotaVentaCreate,
    NotaVentaListOut,
    NotaVentaLineaCreate,
    NotaVentaOut,
    NotaVentaUpdate,
)
from app.models.movimiento_inventario import MovimientoInventario
from app.services.email import EmailNotConfiguredError, enviar_nota_venta
from app.services.pdf import generar_pdf_nota_venta

router = APIRouter()

_TRANSITIONS: dict[tuple[str, str], str] = {
    ("pendiente",  "despachada"): "any",
    ("despachada", "entregada"):  "any",
    ("entregada",  "pagada"):     "admin",
    ("pendiente",  "cancelada"):  "admin",
    ("despachada", "cancelada"):  "admin",
    ("entregada",  "cancelada"):  "admin",
    ("pagada",     "cancelada"):  "admin",
}


def _get_config_dict(db: Session) -> dict:
    return {r.key: r.value for r in db.query(SystemConfig).all()}


def _asignar_numero_nv(db: Session) -> int:
    config = (
        db.query(SystemConfig)
        .filter_by(key="nv_last_id")
        .with_for_update()
        .first()
    )
    if not config:
        config = SystemConfig(key="nv_last_id", value="0")
        db.add(config)
        db.flush()
    numero = int(config.value) + 1
    config.value = str(numero)
    return numero


def _calcular_lineas(db: Session, lineas_data: list[NotaVentaLineaCreate]) -> list[NotaVentaLinea]:
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
        lineas.append(NotaVentaLinea(
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


def _recalcular_totales(nv: NotaVenta) -> None:
    nv.total_neto = sum(l.total_neto for l in nv.lineas)
    nv.total_iva = sum(l.iva for l in nv.lineas)
    nv.total = sum(l.total for l in nv.lineas)


def _can_edit(current_user: User, nv: NotaVenta) -> bool:
    if current_user.role in ("admin", "subadmin"):
        return True
    return nv.vendedor_id == current_user.id


def _check_credit_limit(db: Session, empresa_id: int | None, total: Decimal, current_user: User) -> None:
    if current_user.role in ("admin", "subadmin"):
        return
    if not empresa_id:
        return
    empresa = db.get(Empresa, empresa_id)
    if not empresa or empresa.limite_credito is None:
        return
    facturas = (
        db.query(Factura)
        .filter(Factura.empresa_id == empresa_id, Factura.estado != "anulada")
        .all()
    )
    credito_usado = sum(
        (f.total - (f.monto_pagado or Decimal("0"))
         for f in facturas
         if f.total - (f.monto_pagado or Decimal("0")) > 0),
        Decimal("0"),
    )
    credito_disponible = empresa.limite_credito - credito_usado
    if total > credito_disponible:
        raise HTTPException(
            status_code=402,
            detail=f"Límite de crédito excedido. Disponible: {credito_disponible}, solicitado: {total}",
        )


def _check_lineas_invalidas(lineas: list[NotaVentaLinea]) -> None:
    errors = []
    if any(l.producto_id is None for l in lineas):
        errors.append("linea_sin_item")
    if any(l.margen is not None and l.margen < 0 for l in lineas):
        errors.append("margen_negativo")
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=" | ".join({
                "linea_sin_item": "linea_sin_item: Hay líneas sin producto seleccionado",
                "margen_negativo": "margen_negativo: Hay líneas con margen negativo",
            }[e] for e in errors),
        )


def _validate_despacho(retiro: bool, direccion: str | None) -> None:
    if not retiro and not (direccion and direccion.strip()):
        raise HTTPException(
            status_code=422,
            detail="Debe indicar dirección de despacho o marcar retiro en Conico.",
        )


def _registrar_movimientos_salida(db: Session, nv_id: int, lineas: list, usuario_id: int | None) -> None:
    for linea in lineas:
        if linea.producto_id and linea.cantidad > 0:
            producto = db.get(Producto, linea.producto_id)
            if producto:
                producto.stock_actual -= linea.cantidad
                db.add(MovimientoInventario(
                    producto_id=linea.producto_id,
                    tipo="salida",
                    cantidad=linea.cantidad,
                    signo=-1,
                    referencia_tipo="nota_venta",
                    referencia_id=nv_id,
                    usuario_id=usuario_id,
                ))


def _registrar_movimientos_devolucion(db: Session, nv_id: int, lineas: list, usuario_id: int | None) -> None:
    for linea in lineas:
        if linea.producto_id and linea.cantidad > 0:
            producto = db.get(Producto, linea.producto_id)
            if producto:
                producto.stock_actual += linea.cantidad
                db.add(MovimientoInventario(
                    producto_id=linea.producto_id,
                    tipo="entrada",
                    cantidad=linea.cantidad,
                    signo=1,
                    referencia_tipo="nota_venta",
                    referencia_id=nv_id,
                    usuario_id=usuario_id,
                ))


def _load_nv(db: Session, nv_id: int) -> NotaVenta:
    nv = db.query(NotaVenta).options(
        joinedload(NotaVenta.cliente),
        joinedload(NotaVenta.vendedor),
        joinedload(NotaVenta.empresa),
        joinedload(NotaVenta.cotizacion),
        joinedload(NotaVenta.lineas),
    ).filter(NotaVenta.id == nv_id).first()
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    return nv


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    nvs = (
        db.query(NotaVenta)
        .options(joinedload(NotaVenta.cliente), joinedload(NotaVenta.vendedor))
        .order_by(NotaVenta.numero.desc())
        .all()
    )
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Notas de Venta"
    ws.append(["Nº NV", "Fecha", "Cliente", "Contacto", "Total Neto", "IVA", "Total", "Estado", "Encargado"])
    for nv in nvs:
        ws.append([
            nv.numero,
            nv.fecha.strftime("%d/%m/%Y") if nv.fecha else "",
            nv.cliente.nombre if nv.cliente else "",
            nv.contacto or "",
            float(nv.total_neto),
            float(nv.total_iva),
            float(nv.total),
            nv.estado,
            nv.vendedor.name if nv.vendedor else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=notas_venta.xlsx"},
    )


@router.get("/", response_model=list[NotaVentaListOut])
def listar_nvs(
    estado: str | None = Query(None),
    vendedor_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    q = db.query(NotaVenta).options(
        joinedload(NotaVenta.cliente),
        joinedload(NotaVenta.vendedor),
        joinedload(NotaVenta.empresa),
    )
    if estado:
        q = q.filter(NotaVenta.estado == estado)
    if vendedor_id:
        q = q.filter(NotaVenta.vendedor_id == vendedor_id)
    if cliente_id:
        q = q.filter(NotaVenta.cliente_id == cliente_id)
    if fecha_desde:
        q = q.filter(NotaVenta.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(NotaVenta.fecha <= fecha_hasta)
    return q.order_by(NotaVenta.numero.desc()).all()


@router.post("/", response_model=NotaVentaOut, status_code=status.HTTP_201_CREATED)
def crear_nv(
    body: NotaVentaCreate,
    perms: tuple[User, Session] = require_permission("nota_venta", "create"),
):
    current_user, db = perms
    _validate_despacho(body.retiro_en_conico, body.direccion_despacho)
    numero = _asignar_numero_nv(db)
    vendedor_id = (
        body.vendedor_id
        if body.vendedor_id and current_user.role in ("admin", "subadmin")
        else current_user.id
    )
    nv = NotaVenta(
        numero=numero,
        cliente_id=body.cliente_id,
        vendedor_id=vendedor_id,
        contacto=body.contacto,
        fecha=body.fecha or date.today(),
        nota=body.nota,
        correo=body.correo,
        empresa_id=body.empresa_id,
        direccion_despacho=body.direccion_despacho,
        retiro_en_conico=body.retiro_en_conico,
        terminos_pago=body.terminos_pago,
    )
    db.add(nv)
    db.flush()
    nv.lineas = _calcular_lineas(db, body.lineas)
    _check_lineas_invalidas(nv.lineas)
    for linea in nv.lineas:
        linea.nv_id = nv.id
    _recalcular_totales(nv)
    _check_credit_limit(db, nv.empresa_id, nv.total, current_user)
    _registrar_movimientos_salida(db, nv.id, nv.lineas, current_user.id)
    db.commit()
    return _load_nv(db, nv.id)


@router.post("/from_cotizacion/{cot_id}", response_model=NotaVentaOut, status_code=status.HTTP_201_CREATED)
def crear_nv_desde_cotizacion(
    cot_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "create"),
):
    current_user, db = perms
    cot = db.query(Cotizacion).options(joinedload(Cotizacion.lineas)).filter(Cotizacion.id == cot_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if cot.estado == "cerrada_fv":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La cotización ya está cerrada (ya tiene una nota de venta generada)",
        )

    numero = _asignar_numero_nv(db)
    nv = NotaVenta(
        numero=numero,
        cotizacion_id=cot.id,
        cliente_id=cot.cliente_id,
        empresa_id=cot.empresa_id,
        vendedor_id=cot.vendedor_id,
        contacto=cot.contacto,
        fecha=date.today(),
        nota=cot.nota,
        correo=cot.correo,
        retiro_en_conico=True,  # default until user sets dispatch address
    )
    db.add(nv)
    db.flush()

    lineas = []
    for cl in cot.lineas:
        lineas.append(NotaVentaLinea(
            nv_id=nv.id,
            orden=cl.orden,
            producto_id=cl.producto_id,
            sku=cl.sku,
            descripcion=cl.descripcion,
            formato=cl.formato,
            cantidad=cl.cantidad,
            valor_neto=cl.valor_neto,
            total_neto=cl.total_neto,
            iva=cl.iva,
            total=cl.total,
            margen=cl.margen,
        ))
    _check_lineas_invalidas(lineas)
    nv.lineas = lineas
    _recalcular_totales(nv)
    _check_credit_limit(db, nv.empresa_id, nv.total, current_user)

    cot.estado = "cerrada_fv"
    _registrar_movimientos_salida(db, nv.id, nv.lineas, current_user.id)
    db.commit()
    return _load_nv(db, nv.id)


@router.get("/{nv_id}", response_model=NotaVentaOut)
def obtener_nv(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    return _load_nv(db, nv_id)


@router.patch("/{nv_id}", response_model=NotaVentaOut)
def actualizar_nv(
    nv_id: int,
    body: NotaVentaUpdate,
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    current_user, db = perms
    nv = db.get(NotaVenta, nv_id)
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    if not _can_edit(current_user, nv):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos para editar esta NV")
    nuevo_retiro = body.retiro_en_conico if body.retiro_en_conico is not None else nv.retiro_en_conico
    nueva_dir = body.direccion_despacho if body.direccion_despacho is not None else nv.direccion_despacho
    _validate_despacho(nuevo_retiro, nueva_dir)
    updates = body.model_dump(exclude_unset=True)
    if "vendedor_id" in updates and current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede reasignar el encargado")
    for field, value in updates.items():
        setattr(nv, field, value)
    db.commit()
    return _load_nv(db, nv_id)


@router.put("/{nv_id}/lineas", response_model=NotaVentaOut)
def reemplazar_lineas(
    nv_id: int,
    lineas_data: list[NotaVentaLineaCreate],
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    current_user, db = perms
    nv = db.query(NotaVenta).options(joinedload(NotaVenta.lineas)).filter(NotaVenta.id == nv_id).first()
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    if not _can_edit(current_user, nv):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    # calculate new lineas and validate before any mutation
    nuevas = _calcular_lineas(db, lineas_data)
    _check_lineas_invalidas(nuevas)

    # snapshot old quantities per product
    old_qtys: dict[int, int] = {}
    for linea in nv.lineas:
        if linea.producto_id:
            old_qtys[linea.producto_id] = old_qtys.get(linea.producto_id, 0) + linea.cantidad

    for linea in list(nv.lineas):
        db.delete(linea)
    db.flush()
    for linea in nuevas:
        linea.nv_id = nv_id
        db.add(linea)
    db.flush()
    nv.lineas = nuevas
    _recalcular_totales(nv)
    nv.updated_at = datetime.now(timezone.utc)

    # new quantities per product
    new_qtys: dict[int, int] = {}
    for linea in nuevas:
        if linea.producto_id:
            new_qtys[linea.producto_id] = new_qtys.get(linea.producto_id, 0) + linea.cantidad

    # apply delta: positive delta = more sold = subtract from stock; negative = less sold = add back
    all_ids = set(old_qtys) | set(new_qtys)
    for prod_id in all_ids:
        delta = new_qtys.get(prod_id, 0) - old_qtys.get(prod_id, 0)
        if delta == 0:
            continue
        producto = db.get(Producto, prod_id)
        if not producto:
            continue
        producto.stock_actual -= delta
        db.add(MovimientoInventario(
            producto_id=prod_id,
            tipo="ajuste",
            cantidad=abs(delta),
            signo=-1 if delta > 0 else 1,
            referencia_tipo="nota_venta",
            referencia_id=nv_id,
            usuario_id=current_user.id,
        ))

    db.commit()
    return _load_nv(db, nv_id)


@router.patch("/{nv_id}/estado", response_model=NotaVentaOut)
def cambiar_estado(
    nv_id: int,
    body: EstadoCambio,
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    current_user, db = perms
    nv = db.get(NotaVenta, nv_id)
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")

    transition = (nv.estado, body.estado)
    allowed = _TRANSITIONS.get(transition)
    if allowed is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Transición '{nv.estado}' → '{body.estado}' no permitida",
        )
    if allowed == "admin" and current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede hacer esta transición")

    nv.estado = body.estado
    if body.estado == "cancelada":
        nv_full = db.query(NotaVenta).options(joinedload(NotaVenta.lineas)).filter(NotaVenta.id == nv_id).first()
        _registrar_movimientos_devolucion(db, nv_id, nv_full.lineas if nv_full else [], current_user.id)
    db.commit()
    return _load_nv(db, nv_id)


@router.delete("/{nv_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_nv(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "delete"),
):
    current_user, db = perms
    nv = db.get(NotaVenta, nv_id)
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nota de venta no encontrada")
    if nv.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden eliminar notas de venta en estado 'pendiente'",
        )
    nv_full = db.query(NotaVenta).options(joinedload(NotaVenta.lineas)).filter(NotaVenta.id == nv_id).first()
    _registrar_movimientos_devolucion(db, nv_id, nv_full.lineas if nv_full else [], current_user.id)
    db.delete(nv)
    db.commit()


@router.get("/{nv_id}/pdf")
def generar_pdf(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    nv = _load_nv(db, nv_id)
    _check_lineas_invalidas(nv.lineas)
    config = _get_config_dict(db)
    pdf_bytes = generar_pdf_nota_venta(nv, config)
    cliente_nombre = nv.cliente.nombre if nv.cliente else "cliente"
    raw_filename = f"NV - {nv.numero} {nv.fecha}.{nv.contacto or ''}. {cliente_nombre}.pdf"
    filename = re.sub(r'[^\w\s\-.]', '_', raw_filename)
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{nv_id}/email")
def enviar_email(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "view"),
):
    _, db = perms
    nv = _load_nv(db, nv_id)
    _check_lineas_invalidas(nv.lineas)
    config = _get_config_dict(db)
    try:
        pdf_bytes = generar_pdf_nota_venta(nv, config)
        enviar_nota_venta(nv, pdf_bytes)
    except EmailNotConfiguredError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error al enviar email: {e}")
    return {"detail": "Email enviado correctamente"}
