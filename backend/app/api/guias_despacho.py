from datetime import date, datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import require_permission
from app.api.dte import _next_numero
from app.models.dte_emision import DteEmision
from app.models.empresa import Empresa
from app.models.guia_despacho import GuiaDespacho, GuiaDespachoLinea
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.guia_despacho import (
    GuiaDespachoCreate,
    GuiaDespachoListOut,
    GuiaDespachoOut,
    GuiaDespachoUpdate,
    GuiaEmailBody,
)
from app.services.email import EmailNotConfiguredError, enviar_guia_despacho as _enviar_guia_email
from app.services.pdf import generar_pdf_guia_despacho
from app.utils.logo import empresa_logo_data_uri
from app.tasks.dte import emit_dte

router = APIRouter()


def _config_dict(db: Session) -> dict:
    return {r.key: r.value for r in db.query(SystemConfig).all()}


def _calcular_lineas_y_totales_guia(guia: GuiaDespacho) -> None:
    """En guía, precio_unitario es BRUTO (con IVA), igual que boleta."""
    total_neto = Decimal("0")
    total_iva = Decimal("0")
    total_bruto = Decimal("0")
    tasa = Decimal("0.19")

    for linea in guia.lineas:
        bruto_unit = linea.precio_unitario
        cantidad = linea.cantidad
        descuento = linea.descuento_pct or Decimal("0")
        bruto = bruto_unit * cantidad * (Decimal("1") - descuento / Decimal("100"))

        if linea.exenta:
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

    guia.total_neto = total_neto
    guia.total_iva = total_iva
    guia.total = total_bruto


def _load_guia(db: Session, guia_id: int) -> GuiaDespacho:
    guia = (
        db.query(GuiaDespacho)
        .options(
            joinedload(GuiaDespacho.cliente),
            joinedload(GuiaDespacho.vendedor),
            selectinload(GuiaDespacho.lineas),
        )
        .filter(GuiaDespacho.id == guia_id)
        .first()
    )
    if not guia:
        raise HTTPException(status_code=404, detail="Guía no encontrada")
    return guia


@router.post("/", response_model=GuiaDespachoOut, status_code=status.HTTP_201_CREATED)
def crear_guia_despacho(
    body: GuiaDespachoCreate,
    perms: tuple[User, Session] = require_permission("guias_despacho", "create"),
):
    current_user, db = perms
    try:
        numero = _next_numero(db, "guia_despacho_last_id")
        guia = GuiaDespacho(
            numero=numero,
            fecha=body.fecha or date.today(),
            motivo_traslado=body.motivo_traslado,
            direccion_destino=body.direccion_destino,
            comuna_destino=body.comuna_destino,
            cliente_id=body.cliente_id,
            empresa_id=body.empresa_id,
            nota_venta_id=body.nota_venta_id,
            email_envio=body.email_envio,
            vendedor_id=current_user.id,
        )
        db.add(guia)
        db.flush()

        for l in body.lineas:
            db.add(GuiaDespachoLinea(
                guia_despacho_id=guia.id,
                orden=l.orden,
                producto_id=l.producto_id,
                descripcion=l.descripcion,
                cantidad=l.cantidad,
                precio_unitario=l.precio_unitario,
                descuento_pct=l.descuento_pct,
                exenta=l.exenta,
            ))
        db.flush()
        db.refresh(guia)
        _calcular_lineas_y_totales_guia(guia)

        # Guía DTE 52 NO descuenta stock — el documento tributario asociado lo hace
        # (ver INV-04 / docs/architecture.md). Invariante intencional hasta Phase 3 (D-13).

        emision = DteEmision(
            tipo="052",  # 3 chars con cero líder (Pitfall 8)
            guia_despacho_id=guia.id,
            monto_neto=int(guia.total_neto),
            monto_iva=int(guia.total_iva),
            monto_total=int(guia.total),
        )
        db.add(emision)
        db.flush()

        guia.dte_estado = "pendiente"
        db.commit()
        db.refresh(guia)
    except Exception:
        db.rollback()
        raise

    emit_dte.delay(emision.id)
    return guia


@router.get("/", response_model=list[GuiaDespachoListOut])
def listar_guias_despacho(
    estado: str | None = Query(None),
    dte_estado: str | None = Query(None),
    cliente_id: int | None = Query(None),
    desde: date | None = Query(None),
    hasta: date | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    perms: tuple[User, Session] = require_permission("guias_despacho", "view"),
):
    _, db = perms
    q = db.query(GuiaDespacho)
    if estado:
        q = q.filter(GuiaDespacho.estado == estado)
    if dte_estado:
        q = q.filter(GuiaDespacho.dte_estado == dte_estado)
    if cliente_id:
        q = q.filter(GuiaDespacho.cliente_id == cliente_id)
    if desde:
        q = q.filter(GuiaDespacho.fecha >= desde)
    if hasta:
        q = q.filter(GuiaDespacho.fecha <= hasta)
    return q.order_by(GuiaDespacho.id.desc()).offset(skip).limit(limit).all()


@router.get("/{guia_id}", response_model=GuiaDespachoOut)
def obtener_guia(
    guia_id: int,
    perms: tuple[User, Session] = require_permission("guias_despacho", "view"),
):
    _, db = perms
    return _load_guia(db, guia_id)


@router.patch("/{guia_id}", response_model=GuiaDespachoOut)
def editar_guia(
    guia_id: int,
    body: GuiaDespachoUpdate,
    perms: tuple[User, Session] = require_permission("guias_despacho", "edit"),
):
    _, db = perms
    guia = _load_guia(db, guia_id)
    try:
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(guia, field, value)
        db.commit()
        db.refresh(guia)
    except Exception:
        db.rollback()
        raise
    return guia


@router.delete("/{guia_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_guia(
    guia_id: int,
    perms: tuple[User, Session] = require_permission("guias_despacho", "delete"),
):
    _, db = perms
    guia = _load_guia(db, guia_id)
    if guia.dte_estado != "no_emitida":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar guía emitida; usá NC para anular",
        )
    try:
        db.delete(guia)
        db.commit()
    except Exception:
        db.rollback()
        raise


@router.get("/export/excel")
def exportar_excel(
    perms: tuple[User, Session] = require_permission("guias_despacho", "view"),
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    cliente_id: int | None = None,
    estado: list[str] | None = Query(None),
    dte_estado: list[str] | None = Query(None),
    motivo_traslado: int | None = None,
    vendedor_id: int | None = None,
):
    user, db = perms
    q = db.query(GuiaDespacho).options(
        joinedload(GuiaDespacho.cliente),
        joinedload(GuiaDespacho.vendedor),
    )
    if user.role == "vendedor":
        q = q.filter(GuiaDespacho.vendedor_id == user.id)
    if fecha_desde:
        q = q.filter(GuiaDespacho.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(GuiaDespacho.fecha <= fecha_hasta)
    if cliente_id:
        q = q.filter(GuiaDespacho.cliente_id == cliente_id)
    if estado:
        q = q.filter(GuiaDespacho.estado.in_(estado))
    if dte_estado:
        q = q.filter(GuiaDespacho.dte_estado.in_(dte_estado))
    if motivo_traslado:
        q = q.filter(GuiaDespacho.motivo_traslado == motivo_traslado)
    if vendedor_id:
        q = q.filter(GuiaDespacho.vendedor_id == vendedor_id)

    rows = q.order_by(GuiaDespacho.fecha.desc(), GuiaDespacho.numero.desc()).all()

    from openpyxl import Workbook
    from io import BytesIO
    wb = Workbook()
    ws = wb.active
    ws.title = "Guías de Despacho"
    ws.append([
        "N°", "Fecha", "Cliente", "RUT", "Motivo", "NV vinculada",
        "Total neto", "IVA", "Total", "Estado", "DTE", "Vendedor",
    ])
    for g in rows:
        ws.append([
            g.numero,
            g.fecha.isoformat() if g.fecha else "",
            g.cliente.nombre if g.cliente else "",
            g.cliente.rut if g.cliente else "",
            g.motivo_traslado,
            g.nota_venta_id or "",
            float(g.total_neto or 0),
            float(g.total_iva or 0),
            float(g.total or 0),
            g.estado,
            g.dte_estado,
            g.vendedor.name if g.vendedor else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="guias-despacho.xlsx"'},
    )


@router.get("/{guia_id}/pdf")
def descargar_pdf_guia(
    guia_id: int,
    perms: tuple[User, Session] = require_permission("guias_despacho", "view"),
):
    _, db = perms
    guia = _load_guia(db, guia_id)
    config = _config_dict(db)
    if guia.empresa_id:
        empresa = db.get(Empresa, guia.empresa_id)
        if empresa:
            uri = empresa_logo_data_uri(empresa.logo_path)
            if uri:
                config["empresa_logo_url"] = uri
    pdf_bytes = generar_pdf_guia_despacho(guia, config)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="guia-{guia.numero}.pdf"',
        },
    )


@router.post("/{guia_id}/email", response_model=GuiaDespachoOut)
def enviar_email_guia(
    guia_id: int,
    body: GuiaEmailBody,
    perms: tuple[User, Session] = require_permission("guias_despacho", "edit"),
):
    _, db = perms
    guia = _load_guia(db, guia_id)
    destino = (body.email or guia.email_envio or
               (guia.cliente.email if guia.cliente and getattr(guia.cliente, "email", None) else None))
    if not destino:
        raise HTTPException(status_code=422, detail="No hay email destino")
    config = _config_dict(db)
    if guia.empresa_id:
        empresa = db.get(Empresa, guia.empresa_id)
        if empresa:
            uri = empresa_logo_data_uri(empresa.logo_path)
            if uri:
                config["empresa_logo_url"] = uri
    pdf_bytes = generar_pdf_guia_despacho(guia, config)
    try:
        _enviar_guia_email(guia, pdf_bytes, destino)
    except EmailNotConfiguredError:
        raise HTTPException(status_code=503, detail="Email no configurado")
    try:
        guia.email_enviado_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(guia)
    except Exception:
        db.rollback()
        raise
    return guia
