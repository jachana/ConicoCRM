import re
from collections.abc import Callable
from datetime import date, datetime, timezone
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
from app.services.xml_dte import parse_dte_xml

router = APIRouter()

_TRANSITIONS: dict[tuple[str, str], str] = {
    ("emitida",  "pagada"):  "admin",
    ("emitida",  "anulada"): "admin",
    ("pagada",   "anulada"): "admin_only",
    ("parcial",  "anulada"): "admin_only",
}

_METODOS_PAGO = {"Efectivo", "Transferencia", "Cheque", "Débito", "Crédito", "Mixto"}

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
    _, db = perms
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
    facturas = q.order_by(Factura.numero.desc()).all()

    col_keys = [k for k in (columns or _FAC_DEFAULT_COLUMNS) if k in _FAC_EXPORT_COLUMNS]
    if not col_keys:
        col_keys = _FAC_DEFAULT_COLUMNS

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
    _, db = perms
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
        banco_receptor_id=body.banco_receptor_id,
    )
    db.add(factura)
    db.flush()
    factura.lineas = _calcular_lineas(db, body.lineas)
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
    nv.is_locked = True
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
    _, db = perms
    return _load_factura(db, factura_id)


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
    _, db = perms
    factura = db.get(Factura, factura_id)
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Las facturas no son editables una vez emitidas")


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
