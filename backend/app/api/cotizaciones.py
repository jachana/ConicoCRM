from datetime import date
from decimal import Decimal
from io import BytesIO
import re

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.api.deps import require_permission
from app.database import get_db
from app.models.aprobacion_margen import AprobacionMargen
from app.models.cotizacion import Cotizacion, CotizacionLinea
from app.models.empresa import Empresa
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.cotizacion import (
    CotizacionCreate,
    CotizacionListOut,
    CotizacionOut,
    CotizacionUpdate,
    CotizacionLineaCreate,
)
from app.services.email import EmailNotConfiguredError, enviar_cotizacion
from app.services.pdf import generar_pdf_cotizacion

router = APIRouter()


def _get_config_dict(db: Session) -> dict:
    rows = db.query(SystemConfig).all()
    return {r.key: r.value for r in rows}


def _calcular_lineas(db: Session, lineas_data: list[CotizacionLineaCreate]) -> list[CotizacionLinea]:
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

        lineas.append(CotizacionLinea(
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


def _recalcular_totales(cotizacion: Cotizacion) -> None:
    cotizacion.total_neto = sum(l.total_neto for l in cotizacion.lineas)
    cotizacion.total_iva = sum(l.iva for l in cotizacion.lineas)
    cotizacion.total = sum(l.total for l in cotizacion.lineas)


def _asignar_numero(db: Session) -> int:
    config = (
        db.query(SystemConfig)
        .filter_by(key="cotizacion_last_id")
        .with_for_update()
        .first()
    )
    if not config:
        config = SystemConfig(key="cotizacion_last_id", value="12250")
        db.add(config)
        db.flush()
    numero = int(config.value) + 1
    config.value = str(numero)
    return numero


def _can_edit(current_user: User, cotizacion: Cotizacion) -> bool:
    if current_user.role in ("admin", "subadmin"):
        return True
    return cotizacion.vendedor_id == current_user.id


def _parse_dias(plazo: str | None) -> int:
    if not plazo:
        return 0
    lower = plazo.lower()
    if "contado" in lower:
        return 0
    m = re.search(r'(\d+)', lower)
    return int(m.group(1)) if m else 0


def _calc_terminos_estado(
    terminos_pago: str | None,
    empresa_id: int | None,
    db: Session,
    current_user: User,
) -> str:
    if current_user.role in ("admin", "subadmin"):
        return "aprobado"
    if not terminos_pago or not empresa_id:
        return "aprobado"
    empresa = db.get(Empresa, empresa_id)
    default_dias = _parse_dias(empresa.plazo_credito if empresa else None)
    nuevo_dias = _parse_dias(terminos_pago)
    return "pendiente" if nuevo_dias > default_dias else "aprobado"


def _check_lineas_invalidas(lineas: list[CotizacionLinea]) -> None:
    errors = []
    if any(l.producto_id is None for l in lineas):
        errors.append("linea_sin_item")
    if any(l.margen is not None and l.margen < 0 for l in lineas):
        errors.append("margen_negativo")
    if errors:
        messages = {
            "linea_sin_item": "linea_sin_item: Hay líneas sin producto seleccionado",
            "margen_negativo": "margen_negativo: Hay líneas con margen negativo",
        }
        raise HTTPException(
            status_code=422,
            detail=" | ".join(messages[e] for e in errors),
        )


def check_margin_approval_required(db: Session, cotizacion_id: int) -> bool:
    deviation = (
        db.query(CotizacionLinea)
        .join(Producto, CotizacionLinea.producto_id == Producto.id)
        .filter(
            CotizacionLinea.cotizacion_id == cotizacion_id,
            CotizacionLinea.producto_id.isnot(None),
            CotizacionLinea.valor_neto != Producto.precio_venta,
        )
        .first()
    )
    if not deviation:
        return False
    approved = (
        db.query(AprobacionMargen)
        .filter(
            AprobacionMargen.cotizacion_id == cotizacion_id,
            AprobacionMargen.estado == "aprobada",
        )
        .first()
    )
    return approved is None


@router.get("/{cotizacion_id}/margin-status")
def margin_status(
    cotizacion_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    _, db = perms
    cot = db.get(Cotizacion, cotizacion_id)
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    blocked = check_margin_approval_required(db, cotizacion_id)
    aprobacion = (
        db.query(AprobacionMargen)
        .filter(AprobacionMargen.cotizacion_id == cotizacion_id)
        .order_by(AprobacionMargen.created_at.desc())
        .first()
    )
    return {
        "blocked": blocked,
        "estado": aprobacion.estado if aprobacion else None,
        "aprobacion_id": aprobacion.id if aprobacion else None,
    }


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    _, db = perms
    cotizaciones = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.cliente), joinedload(Cotizacion.vendedor))
        .order_by(Cotizacion.numero.desc())
        .all()
    )
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Cotizaciones"
    ws.append(["Nº COT", "Fecha", "Cliente", "Contacto", "Total Neto", "IVA", "Total", "Estado", "Encargado"])
    for c in cotizaciones:
        ws.append([
            c.numero,
            c.fecha.strftime("%d/%m/%Y") if c.fecha else "",
            c.cliente.nombre if c.cliente else "",
            c.contacto or "",
            float(c.total_neto),
            float(c.total_iva),
            float(c.total),
            c.estado,
            c.vendedor.name if c.vendedor else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=cotizaciones.xlsx"},
    )


@router.get("/", response_model=list[CotizacionListOut])
def listar_cotizaciones(
    estado: list[str] | None = Query(None),
    vendedor_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    terminos_pago_estado: str | None = Query(None),
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    _, db = perms
    q = db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
    )
    if estado:
        q = q.filter(Cotizacion.estado.in_(estado))
    if vendedor_id:
        q = q.filter(Cotizacion.vendedor_id == vendedor_id)
    if cliente_id:
        q = q.filter(Cotizacion.cliente_id == cliente_id)
    if fecha_desde:
        q = q.filter(Cotizacion.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Cotizacion.fecha <= fecha_hasta)
    if terminos_pago_estado:
        q = q.filter(Cotizacion.terminos_pago_estado == terminos_pago_estado)
    return q.order_by(Cotizacion.numero.desc()).all()


@router.post("/", response_model=CotizacionOut, status_code=status.HTTP_201_CREATED)
def crear_cotizacion(
    body: CotizacionCreate,
    perms: tuple[User, Session] = require_permission("cotizaciones", "create"),
):
    current_user, db = perms
    numero = _asignar_numero(db)
    vendedor_id = body.vendedor_id if body.vendedor_id and current_user.role in ("admin", "subadmin") else current_user.id
    cotizacion = Cotizacion(
        numero=numero,
        cliente_id=body.cliente_id,
        vendedor_id=vendedor_id,
        contacto=body.contacto,
        fecha=body.fecha or date.today(),
        estado=body.estado,
        nota=body.nota,
        correo=body.correo,
        empresa_id=body.empresa_id,
        terminos_pago=body.terminos_pago,
        terminos_pago_estado=_calc_terminos_estado(
            body.terminos_pago, body.empresa_id, db, current_user
        ),
    )
    db.add(cotizacion)
    db.flush()

    cotizacion.lineas = _calcular_lineas(db, body.lineas)
    _check_lineas_invalidas(cotizacion.lineas)
    _recalcular_totales(cotizacion)
    db.commit()
    db.refresh(cotizacion)

    return db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
        joinedload(Cotizacion.lineas),
    ).get(cotizacion.id)


@router.get("/{cotizacion_id}", response_model=CotizacionOut)
def obtener_cotizacion(
    cotizacion_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    _, db = perms
    cot = db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
        joinedload(Cotizacion.lineas),
    ).filter(Cotizacion.id == cotizacion_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    return cot


@router.patch("/{cotizacion_id}", response_model=CotizacionOut)
def actualizar_cotizacion(
    cotizacion_id: int,
    body: CotizacionUpdate,
    perms: tuple[User, Session] = require_permission("cotizaciones", "edit"),
):
    current_user, db = perms
    cot = db.get(Cotizacion, cotizacion_id)
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if not _can_edit(current_user, cot):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes editar cotizaciones de otros vendedores")
    update_data = body.model_dump(exclude_unset=True)

    # Handle terminos_pago: auto-set estado based on comparison to empresa default
    if "terminos_pago" in update_data:
        new_plazo = update_data.pop("terminos_pago")
        cot.terminos_pago = new_plazo
        empresa_id = update_data.get("empresa_id", cot.empresa_id)
        auto_estado = _calc_terminos_estado(new_plazo, empresa_id, db, current_user)
        cot.terminos_pago_estado = auto_estado
        update_data.pop("terminos_pago_estado", None)

    # Allow admin to approve/reject directly
    if "terminos_pago_estado" in update_data:
        if current_user.role in ("admin", "subadmin"):
            cot.terminos_pago_estado = update_data.pop("terminos_pago_estado")
        else:
            update_data.pop("terminos_pago_estado")

    for field, value in update_data.items():
        setattr(cot, field, value)
    db.commit()
    db.refresh(cot)
    return db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
        joinedload(Cotizacion.lineas),
    ).get(cotizacion_id)


@router.put("/{cotizacion_id}/lineas", response_model=CotizacionOut)
def reemplazar_lineas(
    cotizacion_id: int,
    lineas_data: list[CotizacionLineaCreate],
    perms: tuple[User, Session] = require_permission("cotizaciones", "edit"),
):
    current_user, db = perms
    cot = db.query(Cotizacion).options(joinedload(Cotizacion.lineas)).get(cotizacion_id)
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if not _can_edit(current_user, cot):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    nuevas_lineas = _calcular_lineas(db, lineas_data)
    _check_lineas_invalidas(nuevas_lineas)

    for linea in list(cot.lineas):
        db.delete(linea)
    db.flush()

    for linea in nuevas_lineas:
        linea.cotizacion_id = cotizacion_id
        db.add(linea)
    db.flush()

    cot.lineas = nuevas_lineas
    _recalcular_totales(cot)
    db.commit()

    return db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
        joinedload(Cotizacion.lineas),
    ).get(cotizacion_id)


@router.delete("/{cotizacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cotizacion(
    cotizacion_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "delete"),
):
    current_user, db = perms
    cot = db.get(Cotizacion, cotizacion_id)
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if cot.estado != "no_definido":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden eliminar cotizaciones con estado 'no_definido'",
        )
    if not _can_edit(current_user, cot):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    db.delete(cot)
    db.commit()


@router.get("/{cotizacion_id}/pdf")
def generar_pdf(
    cotizacion_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    current_user, db = perms
    cot = db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
        joinedload(Cotizacion.lineas),
    ).filter(Cotizacion.id == cotizacion_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    _check_lineas_invalidas(cot.lineas)
    if current_user.role not in ("admin", "subadmin") and check_margin_approval_required(db, cotizacion_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de márgenes",
        )
    if current_user.role not in ("admin", "subadmin") and cot.terminos_pago_estado == "pendiente":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de términos de pago",
        )

    config = _get_config_dict(db)
    pdf_bytes = generar_pdf_cotizacion(cot, config)

    cliente_nombre = cot.cliente.nombre if cot.cliente else "cliente"
    filename = f"COT - {cot.numero} {cot.fecha}.{cot.contacto or ''}. {cliente_nombre}.pdf"

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{cotizacion_id}/email")
def enviar_email(
    cotizacion_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    current_user, db = perms
    cot = db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
        joinedload(Cotizacion.lineas),
    ).filter(Cotizacion.id == cotizacion_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    _check_lineas_invalidas(cot.lineas)
    if current_user.role not in ("admin", "subadmin") and check_margin_approval_required(db, cotizacion_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de márgenes",
        )
    if current_user.role not in ("admin", "subadmin") and cot.terminos_pago_estado == "pendiente":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de términos de pago",
        )

    config = _get_config_dict(db)
    try:
        pdf_bytes = generar_pdf_cotizacion(cot, config)
        enviar_cotizacion(cot, pdf_bytes)
    except EmailNotConfiguredError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error al enviar email: {e}")

    return {"detail": "Email enviado correctamente"}
