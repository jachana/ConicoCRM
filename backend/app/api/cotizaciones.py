from collections.abc import Callable
from datetime import date
from decimal import Decimal
from io import BytesIO
import re

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import String as SqlString, cast, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.auth import get_current_user
from app.api.deps import require_modulo, require_permission
from app.api.shared import enforce_al_contado
from app.api.solicitudes_descuento import (
    check_descuento_approval_required,
    get_umbral_libre_pct,
    lineas_exceed_umbral,
)
from app.database import get_db
from app.models.aprobacion_margen import AprobacionMargen
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion, CotizacionLinea
from app.models.empresa import Empresa
from app.models.producto import Producto
from app.models.solicitud_descuento import SolicitudDescuento
from app.models.system_config import SystemConfig
from app.models.user import User
from app.utils.search import producto_ids_matching, unaccent_ilike
from app.schemas.cotizacion import (
    CotizacionCreate,
    CotizacionListOut,
    CotizacionOut,
    CotizacionUpdate,
    CotizacionLineaCreate,
    RecotizarOut,
)
from app.services.cotizacion_helpers import asignar_numero as _asignar_numero
from app.services.email import EmailNotConfiguredError, enviar_cotizacion
from app.services.pdf import generar_pdf_cotizacion
from app.utils.logo import apply_config_logo

router = APIRouter(dependencies=[require_modulo("cotizaciones")])


def _apply_text_search(query, db: Session, q: str):
    """Filter Cotizacion query by free text matching numero, cliente nombre, or
    line item (descripción/SKU/producto nombre/SKU/marca/tipo/tag)."""
    prod_ids = producto_ids_matching(db, q)
    line_conds = [
        unaccent_ilike(CotizacionLinea.descripcion, f"%{q}%"),
        unaccent_ilike(CotizacionLinea.sku, f"%{q}%"),
    ]
    if prod_ids:
        line_conds.append(CotizacionLinea.producto_id.in_(prod_ids))
    return query.filter(
        or_(
            cast(Cotizacion.numero, SqlString).ilike(f"%{q}%"),
            Cotizacion.cliente.has(unaccent_ilike(Cliente.nombre, f"%{q}%")),
            Cotizacion.lineas.any(or_(*line_conds)),
        )
    )

_ESTADO_LABELS: dict[str, str] = {
    "no_definido": "Sin definir", "abierta": "Abierta", "aprobada": "Aprobada",
    "cerrada_fv": "Cerrada (FV)", "rechazada": "Rechazada",
}

_COT_EXPORT_COLUMNS: dict[str, tuple[str, Callable]] = {
    "numero":         ("Nº COT",      lambda c, l: c.numero),
    "fecha":          ("Fecha",        lambda c, l: c.fecha.strftime("%d/%m/%Y") if c.fecha else ""),
    "estado":         ("Estado",       lambda c, l: _ESTADO_LABELS.get(c.estado, c.estado)),
    "cliente_nombre": ("Cliente",      lambda c, l: c.cliente.nombre if c.cliente else ""),
    "empresa_nombre": ("Empresa",      lambda c, l: c.empresa.nombre if c.empresa else ""),
    "encargado":      ("Encargado",    lambda c, l: c.vendedor.name if c.vendedor else ""),
    "contacto":       ("Contacto",     lambda c, l: c.contacto or ""),
    "sku":            ("SKU",          lambda c, l: l.sku or ""),
    "descripcion":    ("Descripción",  lambda c, l: l.descripcion),
    "formato":        ("Formato",      lambda c, l: l.formato or ""),
    "cantidad":       ("Cantidad",     lambda c, l: l.cantidad),
    "precio_unit":    ("Precio Unit.", lambda c, l: float(l.valor_neto)),
    "total_neto":     ("Total Neto",   lambda c, l: float(l.total_neto)),
    "margen":         ("Margen %",     lambda c, l: round(float(l.margen) * 100, 2) if l.margen is not None else ""),
}
_COT_DEFAULT_COLUMNS = [
    "numero", "fecha", "cliente_nombre", "empresa_nombre",
    "sku", "descripcion", "cantidad", "precio_unit", "total_neto", "margen",
]


def _get_config_dict(db: Session) -> dict:
    rows = db.query(SystemConfig).all()
    return {r.key: r.value for r in rows}


def _calcular_lineas(db: Session, lineas_data: list[CotizacionLineaCreate]) -> list[CotizacionLinea]:
    lineas = []
    for data in lineas_data:
        descuento = data.descuento
        total_neto = data.cantidad * data.valor_neto * (1 - descuento / 100)
        iva = total_neto * Decimal("0.19")
        total = total_neto + iva

        margen = None
        if data.producto_id:
            producto = db.get(Producto, data.producto_id)
            if producto:
                precio_efectivo = data.valor_neto * (1 - descuento / 100)
                margen = (precio_efectivo - producto.precio_costo) / precio_efectivo if precio_efectivo > 0 else Decimal("0")

        lineas.append(CotizacionLinea(
            orden=data.orden,
            producto_id=data.producto_id,
            sku=data.sku,
            descripcion=data.descripcion,
            formato=data.formato,
            cantidad=data.cantidad,
            valor_neto=data.valor_neto,
            descuento=descuento,
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


def _enforce_descuento_libre(
    current_user: User,
    lineas: list[CotizacionLinea],
    db: Session,
) -> None:
    """Vendor can't save a línea with descuento > umbral; must request approval."""
    if current_user.role in ("admin", "subadmin"):
        return
    umbral = get_umbral_libre_pct(db)
    if lineas_exceed_umbral(lineas, umbral):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"descuento_supera_umbral: el descuento por línea no puede superar {umbral}% "
                "sin aprobación. Solicita aprobación al supervisor."
            ),
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
    estado: list[str] | None = Query(None),
    vendedor_id: int | None = Query(None),
    empresa_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    producto_id: list[int] | None = Query(None),
    columns: list[str] | None = Query(None),
    texto: str = Query("", alias="q"),
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    current_user, db = perms
    q = (
        db.query(Cotizacion)
        .options(
            joinedload(Cotizacion.cliente),
            joinedload(Cotizacion.vendedor),
            joinedload(Cotizacion.empresa),
            selectinload(Cotizacion.lineas).joinedload(CotizacionLinea.producto),
        )
    )
    if estado:
        q = q.filter(Cotizacion.estado.in_(estado))
    if vendedor_id:
        q = q.filter(Cotizacion.vendedor_id == vendedor_id)
    if empresa_id:
        q = q.filter(Cotizacion.empresa_id == empresa_id)
    if cliente_id:
        q = q.filter(Cotizacion.cliente_id == cliente_id)
    if fecha_desde:
        q = q.filter(Cotizacion.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Cotizacion.fecha <= fecha_hasta)
    if monto_min is not None:
        q = q.filter(Cotizacion.total >= monto_min)
    if monto_max is not None:
        q = q.filter(Cotizacion.total <= monto_max)
    if producto_id:
        q = q.join(CotizacionLinea, CotizacionLinea.cotizacion_id == Cotizacion.id).filter(
            CotizacionLinea.producto_id.in_(producto_id)
        ).distinct()
    if texto:
        q = _apply_text_search(q, db, texto)
    cotizaciones = q.order_by(Cotizacion.fecha.desc(), Cotizacion.numero.desc()).all()

    col_keys = [k for k in (columns or _COT_DEFAULT_COLUMNS) if k in _COT_EXPORT_COLUMNS]
    if not col_keys:
        col_keys = _COT_DEFAULT_COLUMNS
    if current_user.role == "vendedor":
        col_keys = [k for k in col_keys if k != "margen"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Cotizaciones"
    ws.append([_COT_EXPORT_COLUMNS[k][0] for k in col_keys])
    for c in cotizaciones:
        for l in c.lineas:
            ws.append([_COT_EXPORT_COLUMNS[k][1](c, l) for k in col_keys])

    today = date.today().strftime("%Y-%m-%d")
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=cotizaciones-{today}.xlsx"},
    )


@router.get("/", response_model=dict)
def listar_cotizaciones(
    estado: list[str] | None = Query(None),
    vendedor_id: int | None = Query(None),
    empresa_id: int | None = Query(None),
    cliente_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    producto_id: list[int] | None = Query(None),
    terminos_pago_estado: str | None = Query(None),
    q: str = Query(""),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    current_user, db = perms
    query = db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
        selectinload(Cotizacion.lineas),
    )
    if estado:
        query = query.filter(Cotizacion.estado.in_(estado))
    if vendedor_id:
        query = query.filter(Cotizacion.vendedor_id == vendedor_id)
    if empresa_id:
        query = query.filter(Cotizacion.empresa_id == empresa_id)
    if cliente_id:
        query = query.filter(Cotizacion.cliente_id == cliente_id)
    if fecha_desde:
        query = query.filter(Cotizacion.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Cotizacion.fecha <= fecha_hasta)
    if monto_min is not None:
        query = query.filter(Cotizacion.total >= monto_min)
    if monto_max is not None:
        query = query.filter(Cotizacion.total <= monto_max)
    if producto_id:
        query = query.join(CotizacionLinea, CotizacionLinea.cotizacion_id == Cotizacion.id).filter(
            CotizacionLinea.producto_id.in_(producto_id)
        ).distinct()
    if terminos_pago_estado:
        query = query.filter(Cotizacion.terminos_pago_estado == terminos_pago_estado)
    if q:
        query = _apply_text_search(query, db, q)
    total = query.count()
    items = query.order_by(Cotizacion.fecha.desc(), Cotizacion.numero.desc()).offset(offset).limit(limit).all()
    results = [CotizacionListOut.model_validate(c) for c in items]
    if current_user.role == "vendedor":
        for cot in results:
            cot.margen_total = None
            for linea in cot.lineas:
                linea.margen = None
    return {"data": results, "pagination": {"limit": limit, "offset": offset, "total": total}}


@router.post("/", response_model=CotizacionOut, status_code=status.HTTP_201_CREATED)
def crear_cotizacion(
    body: CotizacionCreate,
    perms: tuple[User, Session] = require_permission("cotizaciones", "create"),
):
    current_user, db = perms
    numero = _asignar_numero(db)
    vendedor_id = body.vendedor_id if body.vendedor_id and current_user.role in ("admin", "subadmin") else current_user.id
    terminos = enforce_al_contado(body.empresa_id, body.terminos_pago, db)
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
        terminos_pago=terminos,
        terminos_pago_estado=_calc_terminos_estado(
            terminos, body.empresa_id, db, current_user
        ),
        validez_dias=body.validez_dias,
        metodo_pago=body.metodo_pago,
        plazo_dias=body.plazo_dias,
    )
    # Auto-populate terminos_pago from empresa.plazo_credito if not provided
    if not cotizacion.terminos_pago and cotizacion.empresa_id:
        empresa = db.get(Empresa, cotizacion.empresa_id)
        cotizacion.terminos_pago = (empresa.plazo_credito if empresa and empresa.plazo_credito else "Al contado")
        cotizacion.terminos_pago_estado = _calc_terminos_estado(cotizacion.terminos_pago, cotizacion.empresa_id, db, current_user)
    db.add(cotizacion)
    db.flush()

    cotizacion.lineas = _calcular_lineas(db, body.lineas)
    _check_lineas_invalidas(cotizacion.lineas)
    _enforce_descuento_libre(current_user, cotizacion.lineas, db)
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
    current_user, db = perms
    cot = db.query(Cotizacion).options(
        joinedload(Cotizacion.cliente),
        joinedload(Cotizacion.vendedor),
        joinedload(Cotizacion.empresa),
        joinedload(Cotizacion.lineas),
        joinedload(Cotizacion.nota_venta),
    ).filter(Cotizacion.id == cotizacion_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if current_user.role == "vendedor":
        from app.schemas.cotizacion import CotizacionOut as _CotizacionOut
        out = _CotizacionOut.model_validate(cot)
        for linea in out.lineas:
            linea.margen = None
        return out
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
    if cot.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cotización bloqueada — se generó una NV desde ella")
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
    cot.terminos_pago = enforce_al_contado(cot.empresa_id, cot.terminos_pago, db)
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
    if cot.is_locked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cotización bloqueada — se generó una NV desde ella")
    if not _can_edit(current_user, cot):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    nuevas_lineas = _calcular_lineas(db, lineas_data)
    _check_lineas_invalidas(nuevas_lineas)
    _enforce_descuento_libre(current_user, nuevas_lineas, db)

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
    if current_user.role not in ("admin", "subadmin") and check_descuento_approval_required(db, cotizacion_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de descuento",
        )

    config = _get_config_dict(db)
    apply_config_logo(config, db.get(Empresa, cot.empresa_id) if cot.empresa_id else None)
    pdf_bytes = generar_pdf_cotizacion(cot, config)

    cliente_nombre = cot.cliente.nombre if cot.cliente else "cliente"
    filename = f"COT - {cot.numero} {cot.fecha}.{cot.contacto or ''}. {cliente_nombre}.pdf"

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


def _build_recotizar(
    db: Session,
    current_user: User,
    source_lineas,
    cliente_id,
    empresa_id,
    vendedor_id,
    contacto,
    nota,
    correo,
) -> RecotizarOut:
    warnings: list[str] = []
    lineas_data: list[CotizacionLineaCreate] = []
    for i, l in enumerate(source_lineas):
        if l.producto_id is not None:
            prod = db.get(Producto, l.producto_id)
            if prod is None:
                warnings.append(l.sku or l.descripcion)
                lineas_data.append(CotizacionLineaCreate(
                    orden=i + 1,
                    producto_id=None,
                    sku=l.sku,
                    descripcion=l.descripcion,
                    formato=l.formato,
                    cantidad=0,
                    valor_neto=l.valor_neto,
                    descuento=Decimal("0"),
                ))
                continue
            lineas_data.append(CotizacionLineaCreate(
                orden=i + 1,
                producto_id=l.producto_id,
                sku=l.sku,
                descripcion=l.descripcion,
                formato=l.formato,
                cantidad=l.cantidad,
                valor_neto=prod.precio_venta,
                descuento=Decimal("0"),
            ))
        else:
            lineas_data.append(CotizacionLineaCreate(
                orden=i + 1,
                producto_id=None,
                sku=l.sku,
                descripcion=l.descripcion,
                formato=l.formato,
                cantidad=l.cantidad,
                valor_neto=l.valor_neto,
                descuento=Decimal("0"),
            ))

    numero = _asignar_numero(db)
    nueva = Cotizacion(
        numero=numero,
        cliente_id=cliente_id,
        empresa_id=empresa_id,
        vendedor_id=vendedor_id,
        contacto=contacto,
        fecha=date.today(),
        nota=nota,
        correo=correo,
        estado="no_definido",
        validez_dias=5,
    )
    if not nueva.terminos_pago and nueva.empresa_id:
        empresa = db.get(Empresa, nueva.empresa_id)
        if empresa and empresa.plazo_credito:
            nueva.terminos_pago = empresa.plazo_credito
    nueva.terminos_pago_estado = "aprobado"

    db.add(nueva)
    db.flush()
    nueva.lineas = _calcular_lineas(db, lineas_data)
    _recalcular_totales(nueva)
    db.commit()
    db.refresh(nueva)
    return RecotizarOut(id=nueva.id, warnings=warnings)


@router.post("/{cotizacion_id}/recotizar", response_model=RecotizarOut, status_code=status.HTTP_201_CREATED)
def recotizar_cotizacion(
    cotizacion_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "create"),
):
    current_user, db = perms
    cot = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.lineas))
        .filter(Cotizacion.id == cotizacion_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    return _build_recotizar(
        db, current_user,
        cot.lineas, cot.cliente_id, cot.empresa_id, cot.vendedor_id,
        cot.contacto, cot.nota, cot.correo,
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
    if current_user.role not in ("admin", "subadmin") and check_descuento_approval_required(db, cotizacion_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere aprobación de descuento",
        )

    config = _get_config_dict(db)
    apply_config_logo(config, db.get(Empresa, cot.empresa_id) if cot.empresa_id else None)
    try:
        pdf_bytes = generar_pdf_cotizacion(cot, config)
        enviar_cotizacion(cot, pdf_bytes)
    except EmailNotConfiguredError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error al enviar email: {e}")

    return {"detail": "Email enviado correctamente"}
