from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO

import openpyxl
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import require_permission
from app.api.dte import _next_numero
from app.models.boleta import Boleta, BoletaLinea
from app.models.dte_emision import DteEmision
from app.models.empresa import Empresa
from app.models.nota_credito import NotaCredito, NotaCreditoLinea
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.boleta import BoletaCreate, BoletaListOut, BoletaOut, BoletaUpdate
from app.services.boleta_stock import descontar_stock_boleta, revertir_stock_boleta
from app.services.email import EmailNotConfiguredError, enviar_boleta as _enviar_boleta_email
from app.services.pdf import generar_pdf_boleta
from app.utils.logo import empresa_logo_data_uri
from app.tasks.dte import emit_dte

router = APIRouter()


def _asignar_numero_boleta(db: Session) -> int:
    cfg = (
        db.query(SystemConfig)
        .filter_by(key="boleta_last_id")
        .with_for_update()
        .first()
    )
    if not cfg:
        cfg = SystemConfig(key="boleta_last_id", value="0")
        db.add(cfg)
        db.flush()
    numero = int(cfg.value) + 1
    cfg.value = str(numero)
    return numero


def _calcular_lineas_y_totales(boleta: Boleta) -> None:
    total_neto = Decimal("0")
    total_iva = Decimal("0")
    total_bruto = Decimal("0")
    tasa = Decimal("0.19") if boleta.tipo_dte == "39" else Decimal("0")

    for linea in boleta.lineas:
        bruto_unit = linea.precio_unitario  # En boleta, precio se ingresa bruto
        cantidad = linea.cantidad
        descuento = linea.descuento_pct or Decimal("0")
        bruto = bruto_unit * cantidad * (Decimal("1") - descuento / Decimal("100"))

        if linea.exenta or boleta.tipo_dte == "41":
            neto = bruto.quantize(Decimal("0.01"))
            iva_linea = Decimal("0")
        else:
            neto = (bruto / (Decimal("1") + tasa)).quantize(Decimal("0.01"))
            iva_linea = (bruto - neto).quantize(Decimal("0.01"))

        linea.total_neto = neto
        linea.iva = iva_linea
        linea.total_linea = (neto + iva_linea).quantize(Decimal("0.01"))

        total_neto += linea.total_neto
        total_iva += linea.iva
        total_bruto += linea.total_linea

    boleta.total_neto = total_neto
    boleta.total_iva = total_iva
    boleta.total = total_bruto


def _validar_boleta_41(payload: BoletaCreate) -> None:
    if payload.tipo_dte == "41":
        if any(not l.exenta for l in payload.lineas):
            raise HTTPException(
                status_code=422,
                detail="Boleta exenta (DTE 41) no admite líneas afectas. Marcá todas las líneas como exenta=true."
            )


def _load_boleta(db: Session, boleta_id: int) -> Boleta:
    boleta = (
        db.query(Boleta)
        .options(
            joinedload(Boleta.cliente),
            joinedload(Boleta.vendedor),
            joinedload(Boleta.lineas),
        )
        .filter(Boleta.id == boleta_id)
        .first()
    )
    if not boleta:
        raise HTTPException(status_code=404, detail="Boleta no encontrada")
    return boleta


@router.post("/", response_model=BoletaOut, status_code=status.HTTP_201_CREATED)
def crear_boleta(
    body: BoletaCreate,
    perms: tuple[User, Session] = require_permission("boletas", "create"),
):
    current_user, db = perms
    _validar_boleta_41(body)

    numero = _asignar_numero_boleta(db)
    boleta = Boleta(
        numero=numero,
        fecha=body.fecha or date.today(),
        tipo_dte=body.tipo_dte,
        cliente_id=body.cliente_id,
        empresa_id=body.empresa_id,
        patente_vehiculo=body.patente_vehiculo,
        email_envio=body.email_envio,
        nombre_receptor=body.nombre_receptor or ("Consumidor Final" if not body.cliente_id else None),
        rut_receptor=body.rut_receptor or ("66666666-6" if not body.cliente_id else None),
        vendedor_id=current_user.id,
        metodo_pago=body.metodo_pago,
    )
    db.add(boleta)
    db.flush()

    boleta.lineas = [
        BoletaLinea(
            boleta_id=boleta.id,
            orden=l.orden,
            producto_id=l.producto_id,
            descripcion=l.descripcion,
            cantidad=l.cantidad,
            precio_unitario=l.precio_unitario,
            descuento_pct=l.descuento_pct,
            exenta=l.exenta,
        )
        for l in body.lineas
    ]
    db.flush()

    _calcular_lineas_y_totales(boleta)

    if body.monto_pagado is not None:
        boleta.monto_pagado = body.monto_pagado
    else:
        boleta.monto_pagado = boleta.total

    descontar_stock_boleta(db, boleta, usuario_id=current_user.id)

    emision = DteEmision(
        tipo=f"0{boleta.tipo_dte}",
        boleta_id=boleta.id,
        monto_neto=int(boleta.total_neto),
        monto_iva=int(boleta.total_iva),
        monto_total=int(boleta.total),
    )
    db.add(emision)
    db.flush()

    boleta.dte_estado = "pendiente"
    db.commit()
    db.refresh(boleta)

    emit_dte.delay(emision.id)

    return boleta


@router.get("/", response_model=list[BoletaListOut])
def listar_boletas(
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    cliente_id: int | None = Query(None),
    patente: str | None = Query(None),
    estado: list[str] | None = Query(None),
    dte_estado: list[str] | None = Query(None),
    metodo_pago: str | None = Query(None),
    vendedor_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    perms: tuple[User, Session] = require_permission("boletas", "view"),
):
    _, db = perms
    q = db.query(Boleta).options(
        joinedload(Boleta.cliente),
        joinedload(Boleta.vendedor),
    )
    if fecha_desde:
        q = q.filter(Boleta.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Boleta.fecha <= fecha_hasta)
    if cliente_id:
        q = q.filter(Boleta.cliente_id == cliente_id)
    if patente:
        normalizada = patente.replace(" ", "").replace("-", "").upper()
        q = q.filter(Boleta.patente_vehiculo == normalizada)
    if estado:
        q = q.filter(Boleta.estado.in_(estado))
    if dte_estado:
        q = q.filter(Boleta.dte_estado.in_(dte_estado))
    if metodo_pago:
        q = q.filter(Boleta.metodo_pago == metodo_pago)
    if vendedor_id:
        q = q.filter(Boleta.vendedor_id == vendedor_id)
    return (
        q.order_by(Boleta.numero.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )


def _config_dict(db: Session) -> dict:
    return {r.key: r.value for r in db.query(SystemConfig).all()}


@router.get("/export/excel")
def exportar_excel(
    fecha_desde: date | None = Query(None),
    fecha_hasta: date | None = Query(None),
    estado: list[str] | None = Query(None),
    perms: tuple[User, Session] = require_permission("boletas", "view"),
):
    _, db = perms
    q = db.query(Boleta).options(
        joinedload(Boleta.cliente),
        joinedload(Boleta.vendedor),
        selectinload(Boleta.lineas),
    )
    if fecha_desde:
        q = q.filter(Boleta.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Boleta.fecha <= fecha_hasta)
    if estado:
        q = q.filter(Boleta.estado.in_(estado))
    boletas = q.order_by(Boleta.numero.desc()).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Boletas"
    ws.append([
        "N", "Fecha", "Tipo", "Receptor", "RUT", "Patente",
        "Total Neto", "IVA", "Total", "Metodo Pago", "Estado", "DTE", "Vendedor",
    ])
    for b in boletas:
        receptor = b.cliente.nombre if b.cliente else (b.nombre_receptor or "Consumidor Final")
        rut = b.cliente.rut if b.cliente else (b.rut_receptor or "66666666-6")
        ws.append([
            b.numero, b.fecha.strftime("%d/%m/%Y"), b.tipo_dte, receptor, rut,
            b.patente_vehiculo or "", float(b.total_neto), float(b.total_iva), float(b.total),
            b.metodo_pago, b.estado, b.dte_estado, b.vendedor.name if b.vendedor else "",
        ])

    today = date.today().strftime("%Y-%m-%d")
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=boletas-{today}.xlsx"},
    )


@router.get("/{boleta_id}", response_model=BoletaOut)
def obtener_boleta(
    boleta_id: int,
    perms: tuple[User, Session] = require_permission("boletas", "view"),
):
    _, db = perms
    return _load_boleta(db, boleta_id)


@router.patch("/{boleta_id}", response_model=BoletaOut)
def actualizar_boleta(
    boleta_id: int,
    body: BoletaUpdate,
    perms: tuple[User, Session] = require_permission("boletas", "edit"),
):
    _, db = perms
    boleta = _load_boleta(db, boleta_id)
    if boleta.dte_estado == "aceptada":
        raise HTTPException(status_code=409, detail="Boleta ya aceptada por SII; no se puede modificar")
    if boleta.estado == "anulada":
        raise HTTPException(status_code=409, detail="Boleta anulada; no se puede modificar")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(boleta, field, value)

    db.commit()
    db.refresh(boleta)
    return boleta


class BoletaAnularBody(BaseModel):
    razon: str


@router.post("/{boleta_id}/anular", response_model=BoletaOut)
def anular_boleta(
    boleta_id: int,
    body: BoletaAnularBody,
    perms: tuple[User, Session] = require_permission("boletas", "delete"),
):
    current_user, db = perms
    boleta = _load_boleta(db, boleta_id)
    if boleta.estado == "anulada":
        raise HTTPException(status_code=409, detail="Boleta ya anulada")

    nc = NotaCredito(
        numero=_next_numero(db, "nc_last_id"),
        fecha=date.today(),
        cliente_id=boleta.cliente_id,
        boleta_id=boleta.id,
        razon=body.razon,
        monto_neto=boleta.total_neto,
        monto_iva=boleta.total_iva,
        monto_total=boleta.total,
    )
    nc.lineas = [
        NotaCreditoLinea(
            orden=l.orden,
            descripcion=l.descripcion,
            cantidad=l.cantidad,
            precio_unitario=l.precio_unitario,
            subtotal=l.total_neto,
        )
        for l in boleta.lineas
    ]
    db.add(nc)
    db.flush()

    revertir_stock_boleta(db, boleta, usuario_id=current_user.id, motivo="boleta_anulada")
    boleta.estado = "anulada"

    db.commit()
    db.refresh(boleta)
    return boleta


@router.get("/{boleta_id}/pdf")
def descargar_pdf(
    boleta_id: int,
    perms: tuple[User, Session] = require_permission("boletas", "view"),
):
    _, db = perms
    boleta = _load_boleta(db, boleta_id)
    config = _config_dict(db)
    if boleta.empresa_id:
        empresa = db.get(Empresa, boleta.empresa_id)
        if empresa:
            uri = empresa_logo_data_uri(empresa.logo_path)
            if uri:
                config["empresa_logo_url"] = uri
    pdf_bytes = generar_pdf_boleta(boleta, config)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="boleta-{boleta.numero}.pdf"'},
    )


class BoletaEmailBody(BaseModel):
    email: str | None = None


@router.post("/{boleta_id}/email", response_model=BoletaOut)
def enviar_email_boleta(
    boleta_id: int,
    body: BoletaEmailBody,
    perms: tuple[User, Session] = require_permission("boletas", "edit"),
):
    _, db = perms
    boleta = _load_boleta(db, boleta_id)
    destino = body.email or boleta.email_envio
    if not destino:
        raise HTTPException(status_code=422, detail="No hay email destino")
    config = _config_dict(db)
    if boleta.empresa_id:
        empresa = db.get(Empresa, boleta.empresa_id)
        if empresa:
            uri = empresa_logo_data_uri(empresa.logo_path)
            if uri:
                config["empresa_logo_url"] = uri
    pdf_bytes = generar_pdf_boleta(boleta, config)
    try:
        _enviar_boleta_email(boleta, pdf_bytes, destino)
    except EmailNotConfiguredError:
        raise HTTPException(status_code=503, detail="Email no configurado")
    boleta.email_enviado_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(boleta)
    return boleta
