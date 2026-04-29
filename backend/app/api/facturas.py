import re
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO

import openpyxl
from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import require_permission
from app.database import get_db
from app.models.factura import Factura, FacturaLinea
from app.models.nota_venta import NotaVenta
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.cotizacion import RecotizarOut
from app.schemas.factura import (
    FacturaCreate,
    FacturaEstadoCambio,
    FacturaLineaCreate,
    FacturaListOut,
    FacturaOut,
    FacturaUpdate,
)
from app.models.empresa import Empresa
from app.schemas.cobranza import ImportXMLError, ImportXMLResult, RecordatorioCreate
from app.services.email import EmailNotConfiguredError, enviar_factura
from app.services.email import enviar_recordatorio as _send_recordatorio
from app.services.pdf import generar_pdf_factura
from app.utils.logo import apply_config_logo
from app.services.xml_dte import parse_dte_xml

router = APIRouter()

_TRANSITIONS: dict[tuple[str, str], str] = {
    ("emitida",  "anulada"): "admin",
    ("pagada",   "anulada"): "admin_only",
    ("parcial",  "anulada"): "admin_only",
}

_DTE_LOCKED_STATES = ("pendiente", "procesando", "aceptada")


def _dte_is_locked(dte_estado: str | None) -> bool:
    return dte_estado in _DTE_LOCKED_STATES


_FAC_EXPORT_COLUMNS: dict[str, tuple[str, Callable]] = {
    "numero":            ("Nº FAC",        lambda f, l: f.numero),
    "fecha":             ("Fecha",          lambda f, l: f.fecha.strftime("%d/%m/%Y") if f.fecha else ""),
    "estado":            ("Estado",         lambda f, l: f.estado),
    "cliente_nombre":    ("Cliente",        lambda f, l: f.cliente.nombre if f.cliente else ""),
    "empresa_nombre":    ("Empresa",        lambda f, l: f.empresa.nombre if f.empresa else ""),
    "encargado":         ("Encargado",      lambda f, l: f.vendedor.name if f.vendedor else ""),
    "contacto":          ("Contacto",       lambda f, l: f.contacto or ""),
    "sku":               ("SKU",            lambda f, l: l.sku or ""),
    "descripcion":       ("Descripción",    lambda f, l: l.descripcion),
    "formato":           ("Formato",        lambda f, l: l.formato or ""),
    "cantidad":          ("Cantidad",       lambda f, l: l.cantidad),
    "precio_unit":       ("Precio Unit.",   lambda f, l: float(l.valor_neto)),
    "total_neto":        ("Total Neto",     lambda f, l: float(l.total_neto)),
    "margen":            ("Margen %",       lambda f, l: round(float(l.margen) * 100, 2) if l.margen is not None else ""),
    "fecha_vencimiento": ("Vencimiento",    lambda f, l: f.fecha_vencimiento.strftime("%d/%m/%Y") if f.fecha_vencimiento else ""),
    "monto_pagado":      ("Monto Pagado",   lambda f, l: float(f.monto_pagado) if f.monto_pagado is not None else ""),
    "metodo_pago":       ("Método Pago",    lambda f, l: f.metodo_pago or ""),
    "fecha_pago":        ("Fecha Pago",     lambda f, l: f.fecha_pago.strftime("%d/%m/%Y") if f.fecha_pago else ""),
}
_FAC_DEFAULT_COLUMNS = [
    "numero", "fecha", "cliente_nombre", "empresa_nombre",
    "sku", "descripcion", "cantidad", "precio_unit", "total_neto", "margen",
]


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


def _calcular_lineas(db: Session, lineas_data: list[FacturaLineaCreate], es_exenta: bool = False) -> list[FacturaLinea]:
    lineas = []
    for data in lineas_data:
        total_neto = data.cantidad * data.valor_neto
        iva = Decimal("0") if es_exenta else total_neto * Decimal("0.19")
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
        joinedload(Factura.banco_receptor),
    ).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    return factura


def _upsert_from_xml(db: Session, xml_bytes: bytes) -> tuple[Factura, str]:
    parsed = parse_dte_xml(xml_bytes)

    empresa = db.query(Empresa).filter(Empresa.rut == parsed["rut_receptor"]).first()
    if empresa is None:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Empresa con RUT {parsed['rut_receptor']} no encontrada en el sistema",
                "empresa_data": {
                    "rut": parsed["rut_receptor"],
                    "nombre": parsed.get("nombre_receptor") or "",
                    "email": parsed.get("correo_receptor") or "",
                },
            },
        )

    lineas_data = parsed["lineas"]
    existing = db.query(Factura).filter(Factura.numero == parsed["numero"]).first()

    factura_fields = {
        "numero": parsed["numero"],
        "fecha": parsed["fecha"],
        "fecha_vencimiento": parsed["fecha_vencimiento"],
        "total_neto": parsed["total_neto"],
        "total_iva": parsed["total_iva"],
        "total": parsed["total"],
        "empresa_id": empresa.id,
        "cliente_id": None,
        "correo": parsed.get("correo_receptor"),
        "origen": "xml",
        "xml_raw": xml_bytes.decode("utf-8", errors="replace"),
    }

    if existing:
        for key, val in factura_fields.items():
            setattr(existing, key, val)
        for linea in list(existing.lineas):
            db.delete(linea)
        db.flush()
        factura = existing
        accion = "actualizada"
    else:
        factura = Factura(**factura_fields, estado="emitida", monto_pagado=Decimal("0"))
        db.add(factura)
        db.flush()
        accion = "creada"

    for linea_data in lineas_data:
        db.add(FacturaLinea(factura_id=factura.id, **linea_data))

    config_row = db.query(SystemConfig).filter(SystemConfig.key == "factura_last_id").first()
    if config_row and int(config_row.value or "0") < factura.numero:
        config_row.value = str(factura.numero)

    db.commit()
    db.refresh(factura)
    return factura, accion


@router.get("/export/excel")
def exportar_excel(
    estado: list[str] | None = Query(None),
    cliente_id: int | None = Query(None),
    empresa_id: int | None = Query(None),
    vendedor_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    producto_id: list[int] | None = Query(None),
    columns: list[str] | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    q = (
        db.query(Factura)
        .options(
            joinedload(Factura.cliente),
            joinedload(Factura.vendedor),
            joinedload(Factura.empresa),
            selectinload(Factura.lineas),
        )
    )
    if estado:
        q = q.filter(Factura.estado.in_(estado))
    if cliente_id:
        q = q.filter(Factura.cliente_id == cliente_id)
    if empresa_id:
        q = q.filter(Factura.empresa_id == empresa_id)
    if vendedor_id:
        q = q.filter(Factura.vendedor_id == vendedor_id)
    if fecha_desde:
        q = q.filter(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Factura.fecha <= fecha_hasta)
    if monto_min is not None:
        q = q.filter(Factura.total >= monto_min)
    if monto_max is not None:
        q = q.filter(Factura.total <= monto_max)
    if producto_id:
        q = q.join(FacturaLinea, FacturaLinea.factura_id == Factura.id).filter(
            FacturaLinea.producto_id.in_(producto_id)
        ).distinct()
    facturas = q.order_by(Factura.fecha.desc(), Factura.numero.desc()).all()

    col_keys = [k for k in (columns or _FAC_DEFAULT_COLUMNS) if k in _FAC_EXPORT_COLUMNS]
    if not col_keys:
        col_keys = _FAC_DEFAULT_COLUMNS
    if current_user.role == "vendedor":
        col_keys = [k for k in col_keys if k != "margen"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Facturas"
    ws.append([_FAC_EXPORT_COLUMNS[k][0] for k in col_keys])
    for f in facturas:
        for l in f.lineas:
            ws.append([_FAC_EXPORT_COLUMNS[k][1](f, l) for k in col_keys])

    today = date.today().strftime("%Y-%m-%d")
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=facturas-{today}.xlsx"},
    )


@router.get("/", response_model=list[FacturaListOut])
def listar_facturas(
    estado: list[str] | None = Query(None),
    cliente_id: int | None = Query(None),
    empresa_id: int | None = Query(None),
    vendedor_id: int | None = Query(None),
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    monto_min: Decimal | None = Query(None),
    monto_max: Decimal | None = Query(None),
    producto_id: list[int] | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    q = db.query(Factura).options(
        joinedload(Factura.cliente),
        joinedload(Factura.vendedor),
        joinedload(Factura.empresa),
        selectinload(Factura.lineas),
    )
    if estado:
        q = q.filter(Factura.estado.in_(estado))
    if cliente_id:
        q = q.filter(Factura.cliente_id == cliente_id)
    if empresa_id:
        q = q.filter(Factura.empresa_id == empresa_id)
    if vendedor_id:
        q = q.filter(Factura.vendedor_id == vendedor_id)
    if fecha_desde:
        q = q.filter(Factura.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Factura.fecha <= fecha_hasta)
    if monto_min is not None:
        q = q.filter(Factura.total >= monto_min)
    if monto_max is not None:
        q = q.filter(Factura.total <= monto_max)
    if producto_id:
        q = q.join(FacturaLinea, FacturaLinea.factura_id == Factura.id).filter(
            FacturaLinea.producto_id.in_(producto_id)
        ).distinct()
    results = [FacturaListOut.model_validate(f) for f in q.order_by(Factura.fecha.desc(), Factura.numero.desc()).all()]
    if current_user.role == "vendedor":
        for fac in results:
            fac.margen_total = None
            for linea in fac.lineas:
                linea.margen = None
    return results


@router.post("/", response_model=FacturaOut, status_code=status.HTTP_201_CREATED)
def crear_factura(
    body: FacturaCreate,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede crear facturas")
    numero = _asignar_numero_factura(db)
    fecha = body.fecha or date.today()
    fecha_venc = body.fecha_vencimiento
    if fecha_venc is None and body.plazo_dias > 0:
        fecha_venc = fecha + timedelta(days=body.plazo_dias)
    factura = Factura(
        numero=numero,
        cliente_id=body.cliente_id,
        vendedor_id=body.vendedor_id,
        contacto=body.contacto,
        fecha=fecha,
        fecha_vencimiento=fecha_venc,
        nota=body.nota,
        correo=body.correo,
        empresa_id=body.empresa_id,
        banco_receptor_id=body.banco_receptor_id,
        metodo_pago=body.metodo_pago,
        plazo_dias=body.plazo_dias,
        tipo_dte=body.tipo_dte,
    )
    db.add(factura)
    db.flush()
    factura.lineas = _calcular_lineas(db, body.lineas, es_exenta=body.tipo_dte == "034")
    for linea in factura.lineas:
        linea.factura_id = factura.id
    _recalcular_totales(factura)
    if body.nv_id:
        nv_to_lock = db.get(NotaVenta, body.nv_id)
        if nv_to_lock:
            nv_to_lock.is_locked = True
    db.commit()
    return _load_factura(db, factura.id)


@router.post("/from_nv/{nv_id}", response_model=FacturaOut, status_code=status.HTTP_201_CREATED)
def crear_factura_desde_nv(
    nv_id: int,
    tipo_dte: str = Query("033", pattern="^0(33|34)$"),
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
    fecha = date.today()
    fecha_venc = fecha + timedelta(days=nv.plazo_dias) if nv.plazo_dias > 0 else None
    factura = Factura(
        numero=numero,
        nv_id=nv.id,
        cotizacion_id=nv.cotizacion_id,
        cliente_id=nv.cliente_id,
        empresa_id=nv.empresa_id,
        vendedor_id=nv.vendedor_id,
        contacto=nv.contacto,
        fecha=fecha,
        fecha_vencimiento=fecha_venc,
        nota=nv.nota,
        correo=nv.correo,
        metodo_pago=nv.metodo_pago,
        plazo_dias=nv.plazo_dias,
        tipo_dte=tipo_dte,
    )
    db.add(factura)
    db.flush()

    es_exenta = tipo_dte == "034"
    lineas = []
    for nl in nv.lineas:
        total_neto = nl.total_neto
        iva = Decimal("0") if es_exenta else nl.iva
        total = total_neto + iva
        lineas.append(FacturaLinea(
            factura_id=factura.id,
            orden=nl.orden,
            producto_id=nl.producto_id,
            sku=nl.sku,
            descripcion=nl.descripcion,
            formato=nl.formato,
            cantidad=nl.cantidad,
            valor_neto=nl.valor_neto,
            total_neto=total_neto,
            iva=iva,
            total=total,
            margen=nl.margen,
        ))
    factura.lineas = lineas
    _recalcular_totales(factura)
    nv.is_locked = True
    nv.estado = "facturada"
    db.commit()
    return _load_factura(db, factura.id)


@router.post("/import/xml", response_model=FacturaOut, status_code=status.HTTP_201_CREATED)
def import_xml(
    file: UploadFile = File(...),
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=403, detail="Solo admin o subadmin pueden importar facturas")
    xml_bytes = file.file.read()
    try:
        factura, _ = _upsert_from_xml(db, xml_bytes)
    except HTTPException as exc:
        if isinstance(exc.detail, dict):
            raise HTTPException(status_code=exc.status_code, detail=exc.detail["message"])
        raise
    return _load_factura(db, factura.id)


@router.post("/import/xml/bulk", response_model=ImportXMLResult)
def import_xml_bulk(
    files: list[UploadFile] = File(...),
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=403, detail="Solo admin o subadmin pueden importar facturas")

    creadas = actualizadas = 0
    errores: list[ImportXMLError] = []

    for f in files:
        try:
            xml_bytes = f.file.read()
            _, accion = _upsert_from_xml(db, xml_bytes)
            if accion == "creada":
                creadas += 1
            else:
                actualizadas += 1
        except HTTPException as exc:
            if isinstance(exc.detail, dict):
                errores.append(ImportXMLError(
                    filename=f.filename or "unknown",
                    message=exc.detail["message"],
                    empresa_data=exc.detail.get("empresa_data"),
                ))
            else:
                errores.append(ImportXMLError(
                    filename=f.filename or "unknown",
                    message=exc.detail,
                ))
        except Exception as exc:
            errores.append(ImportXMLError(filename=f.filename or "unknown", message=str(exc)))

    return ImportXMLResult(creadas=creadas, actualizadas=actualizadas, errores=errores)


@router.get("/{factura_id}", response_model=FacturaOut)
def obtener_factura(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    factura = _load_factura(db, factura_id)
    if current_user.role == "vendedor":
        out = FacturaOut.model_validate(factura)
        for linea in out.lineas:
            linea.margen = None
        return out
    return factura


@router.patch("/{factura_id}", response_model=FacturaOut)
def actualizar_factura(
    factura_id: int,
    body: FacturaUpdate,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    _, db = perms
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    if factura.estado in ("pagada", "anulada"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede modificar una factura en estado '{factura.estado}'"
        )
    if _dte_is_locked(factura.dte_estado):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Factura ya enviada al SII; no se puede modificar. Use Nota de Crédito para corregir.",
        )
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(factura, field, value)
    if "plazo_dias" in update_data and "fecha_vencimiento" not in update_data:
        if factura.plazo_dias > 0:
            factura.fecha_vencimiento = factura.fecha + timedelta(days=factura.plazo_dias)
        else:
            factura.fecha_vencimiento = None
    db.commit()
    return _load_factura(db, factura_id)


@router.put("/{factura_id}/lineas", response_model=FacturaOut)
def reemplazar_lineas(
    factura_id: int,
    lineas_data: list[FacturaLineaCreate],
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    _, db = perms
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="La edición de líneas no está habilitada")


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

    if body.estado == "pagada":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El estado 'pagada' se deriva automáticamente de los pagos registrados. Use el módulo de pagos.",
        )

    transition = (factura.estado, body.estado)
    allowed = _TRANSITIONS.get(transition)
    if allowed is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Transición '{factura.estado}' → '{body.estado}' no permitida",
        )
    if allowed == "admin_only" and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede hacer esta transición")

    if body.estado == "anulada" and _dte_is_locked(factura.dte_estado):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Factura ya enviada al SII; no se puede anular directamente. Use Nota de Crédito.",
        )

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
    if _dte_is_locked(factura.dte_estado):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Factura ya enviada al SII; no se puede eliminar. Use Nota de Crédito para anular.",
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
    apply_config_logo(config, db.get(Empresa, factura.empresa_id) if factura.empresa_id else None)
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
    apply_config_logo(config, db.get(Empresa, factura.empresa_id) if factura.empresa_id else None)
    try:
        pdf_bytes = generar_pdf_factura(factura, config)
        enviar_factura(factura, pdf_bytes)
    except EmailNotConfiguredError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error al enviar email: {e}")
    return {"detail": "Email enviado correctamente"}


@router.post("/{factura_id}/recordatorio")
def enviar_recordatorio(
    factura_id: int,
    data: RecordatorioCreate,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    _, db = perms
    factura = _load_factura(db, factura_id)
    try:
        _send_recordatorio(to=data.to, subject=data.subject, body=data.body)
    except EmailNotConfiguredError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error al enviar recordatorio: {e}")
    factura.ultimo_recordatorio = date.today()
    db.commit()
    return {"detail": "Recordatorio enviado"}


@router.post("/{factura_id}/recotizar", response_model=RecotizarOut, status_code=status.HTTP_201_CREATED)
def recotizar_factura(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "create"),
):
    from app.api.cotizaciones import _build_recotizar
    current_user, db = perms
    factura = (
        db.query(Factura)
        .options(joinedload(Factura.lineas))
        .filter(Factura.id == factura_id)
        .first()
    )
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    return _build_recotizar(
        db, current_user,
        factura.lineas, factura.cliente_id, factura.empresa_id, factura.vendedor_id,
        factura.contacto, factura.nota, factura.correo,
    )
