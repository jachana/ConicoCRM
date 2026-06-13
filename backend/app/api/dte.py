import json
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_modulo, require_permission
from app.models.boleta import Boleta
from app.models.dte_emision import DteEmision
from app.models.factura import Factura
from app.models.guia_despacho import GuiaDespacho
from app.models.nota_credito import NotaCredito, NotaCreditoLinea
from app.models.nota_debito import NotaDebito, NotaDebitoLinea
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.dte import (
    DteEmisionOut,
    NotaCreditoCreate, NotaCreditoOut,
    NotaDebitoCreate, NotaDebitoOut,
)
from app.services.dte_service import get_dte_service
from app.services.pdf import generar_pdf_nota_credito, generar_pdf_nota_debito
from app.tasks.dte import emit_dte, _lioren_to_estado, _sync_dte_estado

router = APIRouter()


def _get_config_dict(db: Session) -> dict:
    return {r.key: r.value for r in db.query(SystemConfig).all()}


def _next_numero(db: Session, key: str) -> int:
    cfg = db.query(SystemConfig).filter_by(key=key).with_for_update().first()
    if not cfg:
        cfg = SystemConfig(key=key, value="0")
        db.add(cfg)
        db.flush()
    numero = int(cfg.value) + 1
    cfg.value = str(numero)
    return numero


def _calcular_lineas_nc(lineas_data) -> list[NotaCreditoLinea]:
    lineas = []
    for i, data in enumerate(lineas_data):
        orden = data.orden if data.orden is not None else i
        lineas.append(NotaCreditoLinea(
            orden=orden,
            descripcion=data.descripcion,
            cantidad=data.cantidad,
            precio_unitario=data.precio_unitario,
            subtotal=data.cantidad * data.precio_unitario,
        ))
    return lineas


def _calcular_lineas_nd(lineas_data) -> list[NotaDebitoLinea]:
    lineas = []
    for i, data in enumerate(lineas_data):
        orden = data.orden if data.orden is not None else i
        lineas.append(NotaDebitoLinea(
            orden=orden,
            descripcion=data.descripcion,
            cantidad=data.cantidad,
            precio_unitario=data.precio_unitario,
            subtotal=data.cantidad * data.precio_unitario,
        ))
    return lineas


def _recalcular_nc(nc: NotaCredito) -> None:
    nc.monto_neto = sum(l.subtotal for l in nc.lineas)
    nc.monto_iva = round(nc.monto_neto * Decimal("0.19"), 2)
    nc.monto_total = nc.monto_neto + nc.monto_iva


def _recalcular_nd(nd: NotaDebito) -> None:
    nd.monto_neto = sum(l.subtotal for l in nd.lineas)
    nd.monto_iva = round(nd.monto_neto * Decimal("0.19"), 2)
    nd.monto_total = nd.monto_neto + nd.monto_iva


# ── Factura DTE ────────────────────────────────────────────────────────────────

@router.post("/facturas/{factura_id}/emitir", response_model=DteEmisionOut, dependencies=[require_modulo("facturas")])
def emitir_factura(
    factura_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    _, db = perms
    factura = db.query(Factura).options(joinedload(Factura.lineas)).filter_by(id=factura_id).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if factura.dte_estado != "no_emitida":
        raise HTTPException(status_code=409, detail=f"Factura ya en estado DTE: {factura.dte_estado}")
    existing = db.query(DteEmision).filter_by(factura_id=factura_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe una emisión para esta factura")
    emision = DteEmision(
        tipo=factura.tipo_dte or "033",
        factura_id=factura.id,
        monto_neto=int(factura.total_neto),
        monto_iva=int(factura.total_iva),
        monto_total=int(factura.total),
    )
    db.add(emision)
    factura.dte_estado = "pendiente"
    db.commit()
    db.refresh(emision)
    emit_dte.delay(emision.id)
    return emision


# ── Notas de Crédito ───────────────────────────────────────────────────────────

@router.post("/notas-credito/", response_model=NotaCreditoOut, status_code=201, dependencies=[require_modulo("nota_credito")])
def crear_nc(
    body: NotaCreditoCreate,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    _, db = perms
    if body.guia_despacho_id is not None:
        guia = db.query(GuiaDespacho).filter_by(id=body.guia_despacho_id).first()
        if not guia:
            raise HTTPException(status_code=404, detail="Guía de despacho no encontrada")
        if guia.cliente_id is not None and guia.cliente_id != body.cliente_id:
            raise HTTPException(status_code=422, detail="La guía referenciada no pertenece al cliente indicado")
    if body.factura_id is not None:
        factura = db.query(Factura).filter_by(id=body.factura_id).first()
        if not factura:
            raise HTTPException(status_code=404, detail="Factura no encontrada")
        if factura.cliente_id is not None and factura.cliente_id != body.cliente_id:
            raise HTTPException(status_code=422, detail="La factura referenciada no pertenece al cliente indicado")
    nc = NotaCredito(
        numero=_next_numero(db, "nc_last_id"),
        fecha=body.fecha or date.today(),
        cliente_id=body.cliente_id,
        guia_despacho_id=body.guia_despacho_id,
        factura_id=body.factura_id,
        razon=body.razon,
        monto_neto=Decimal("0"),
        monto_iva=Decimal("0"),
        monto_total=Decimal("0"),
    )
    nc.lineas = _calcular_lineas_nc(body.lineas)
    db.add(nc)
    db.flush()
    _recalcular_nc(nc)
    db.commit()
    db.refresh(nc)
    return nc


@router.get("/notas-credito/", response_model=dict, dependencies=[require_modulo("nota_credito")])
def listar_nc(
    perms: tuple[User, Session] = require_permission("facturas", "view"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    current_user, db = perms
    if current_user.role == "vendedor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso restringido a admin/subadmin")
    q = db.query(NotaCredito).options(joinedload(NotaCredito.lineas))
    total = q.count()
    items = q.order_by(NotaCredito.numero.desc()).offset(offset).limit(limit).all()
    return {"data": [NotaCreditoOut.model_validate(nc) for nc in items], "pagination": {"limit": limit, "offset": offset, "total": total}}


@router.get("/notas-credito/{nc_id}", response_model=NotaCreditoOut, dependencies=[require_modulo("nota_credito")])
def get_nc(
    nc_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    if current_user.role == "vendedor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso restringido a admin/subadmin")
    nc = db.query(NotaCredito).options(joinedload(NotaCredito.lineas)).filter_by(id=nc_id).first()
    if not nc:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    out = NotaCreditoOut.model_validate(nc)
    # Resolver números legibles del documento referenciado.
    if nc.boleta_id is not None:
        out.boleta_numero = db.query(Boleta.numero).filter(Boleta.id == nc.boleta_id).scalar()
    if nc.guia_despacho_id is not None:
        out.guia_despacho_numero = (
            db.query(GuiaDespacho.numero).filter(GuiaDespacho.id == nc.guia_despacho_id).scalar()
        )
    if nc.factura_id is not None:
        out.factura_numero = db.query(Factura.numero).filter(Factura.id == nc.factura_id).scalar()
    return out


@router.get("/notas-credito/{nc_id}/pdf", dependencies=[require_modulo("nota_credito")])
def pdf_nc(
    nc_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    if current_user.role == "vendedor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso restringido a admin/subadmin")
    nc = db.query(NotaCredito).options(joinedload(NotaCredito.lineas), joinedload(NotaCredito.cliente)).filter_by(id=nc_id).first()
    if not nc:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    config = _get_config_dict(db)
    pdf_bytes = generar_pdf_nota_credito(nc, config)
    cliente_nombre = nc.cliente.nombre if nc.cliente else "cliente"
    raw_filename = f"NC - {nc.numero} {nc.fecha}. {cliente_nombre}.pdf"
    filename = re.sub(r'[^\w\s\-.]', '_', raw_filename)
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/notas-credito/{nc_id}/emitir", response_model=DteEmisionOut, dependencies=[require_modulo("nota_credito")])
def emitir_nc(
    nc_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    _, db = perms
    nc = db.query(NotaCredito).filter_by(id=nc_id).first()
    if not nc:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    if nc.dte_estado != "no_emitida":
        raise HTTPException(status_code=409, detail=f"NC ya en estado DTE: {nc.dte_estado}")
    existing = db.query(DteEmision).filter_by(nota_credito_id=nc_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe una emisión para esta nota de crédito")
    emision = DteEmision(
        tipo="061",
        nota_credito_id=nc.id,
        monto_neto=int(nc.monto_neto),
        monto_iva=int(nc.monto_iva),
        monto_total=int(nc.monto_total),
    )
    db.add(emision)
    nc.dte_estado = "pendiente"
    db.commit()
    db.refresh(emision)
    emit_dte.delay(emision.id)
    return emision


# ── Notas de Débito ────────────────────────────────────────────────────────────

@router.post("/notas-debito/", response_model=NotaDebitoOut, status_code=201, dependencies=[require_modulo("nota_debito")])
def crear_nd(
    body: NotaDebitoCreate,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    _, db = perms
    if body.factura_id is not None:
        factura = db.query(Factura).filter_by(id=body.factura_id).first()
        if not factura:
            raise HTTPException(status_code=404, detail="Factura no encontrada")
        if factura.cliente_id is not None and factura.cliente_id != body.cliente_id:
            raise HTTPException(status_code=422, detail="La factura referenciada no pertenece al cliente indicado")
    nd = NotaDebito(
        numero=_next_numero(db, "nd_last_id"),
        fecha=body.fecha or date.today(),
        cliente_id=body.cliente_id,
        factura_id=body.factura_id,
        razon=body.razon,
        monto_neto=Decimal("0"),
        monto_iva=Decimal("0"),
        monto_total=Decimal("0"),
    )
    nd.lineas = _calcular_lineas_nd(body.lineas)
    db.add(nd)
    db.flush()
    _recalcular_nd(nd)
    db.commit()
    db.refresh(nd)
    return nd


@router.get("/notas-debito/", response_model=list[NotaDebitoOut], dependencies=[require_modulo("nota_debito")])
def listar_nd(
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    if current_user.role == "vendedor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso restringido a admin/subadmin")
    return db.query(NotaDebito).options(joinedload(NotaDebito.lineas)).order_by(NotaDebito.numero.desc()).all()


@router.get("/notas-debito/{nd_id}", response_model=NotaDebitoOut, dependencies=[require_modulo("nota_debito")])
def get_nd(
    nd_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    if current_user.role == "vendedor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso restringido a admin/subadmin")
    nd = db.query(NotaDebito).options(joinedload(NotaDebito.lineas)).filter_by(id=nd_id).first()
    if not nd:
        raise HTTPException(status_code=404, detail="Nota de débito no encontrada")
    out = NotaDebitoOut.model_validate(nd)
    if nd.factura_id is not None:
        out.factura_numero = db.query(Factura.numero).filter(Factura.id == nd.factura_id).scalar()
    return out


@router.get("/notas-debito/{nd_id}/pdf", dependencies=[require_modulo("nota_debito")])
def pdf_nd(
    nd_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    current_user, db = perms
    if current_user.role == "vendedor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso restringido a admin/subadmin")
    nd = db.query(NotaDebito).options(joinedload(NotaDebito.lineas), joinedload(NotaDebito.cliente)).filter_by(id=nd_id).first()
    if not nd:
        raise HTTPException(status_code=404, detail="Nota de débito no encontrada")
    config = _get_config_dict(db)
    pdf_bytes = generar_pdf_nota_debito(nd, config)
    cliente_nombre = nd.cliente.nombre if nd.cliente else "cliente"
    raw_filename = f"ND - {nd.numero} {nd.fecha}. {cliente_nombre}.pdf"
    filename = re.sub(r'[^\w\s\-.]', '_', raw_filename)
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/notas-debito/{nd_id}/emitir", response_model=DteEmisionOut, dependencies=[require_modulo("nota_debito")])
def emitir_nd(
    nd_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "create"),
):
    _, db = perms
    nd = db.query(NotaDebito).filter_by(id=nd_id).first()
    if not nd:
        raise HTTPException(status_code=404, detail="Nota de débito no encontrada")
    if nd.dte_estado != "no_emitida":
        raise HTTPException(status_code=409, detail=f"ND ya en estado DTE: {nd.dte_estado}")
    existing = db.query(DteEmision).filter_by(nota_debito_id=nd_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe una emisión para esta nota de débito")
    emision = DteEmision(
        tipo="056",
        nota_debito_id=nd.id,
        monto_neto=int(nd.monto_neto),
        monto_iva=int(nd.monto_iva),
        monto_total=int(nd.monto_total),
    )
    db.add(emision)
    nd.dte_estado = "pendiente"
    db.commit()
    db.refresh(emision)
    emit_dte.delay(emision.id)
    return emision


# ── Guías de Despacho ─────────────────────────────────────────────────────────

@router.post("/guias-despacho/{guia_id}/emitir", response_model=DteEmisionOut, dependencies=[require_modulo("guias_despacho")])
def emitir_guia_despacho(
    guia_id: int,
    perms: tuple[User, Session] = require_permission("guias_despacho", "create"),
):
    _, db = perms
    guia = db.query(GuiaDespacho).filter_by(id=guia_id).first()
    if not guia:
        raise HTTPException(status_code=404, detail="Guía no encontrada")
    if guia.dte_estado != "no_emitida":
        raise HTTPException(
            status_code=409,
            detail=f"Guía ya en estado DTE: {guia.dte_estado}",
        )
    existing = db.query(DteEmision).filter_by(guia_despacho_id=guia_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya existe una emisión para esta guía")
    try:
        emision = DteEmision(
            tipo="052",
            guia_despacho_id=guia.id,
            monto_neto=int(guia.total_neto),
            monto_iva=int(guia.total_iva),
            monto_total=int(guia.total),
        )
        db.add(emision)
        guia.dte_estado = "pendiente"
        db.commit()
        db.refresh(emision)
    except Exception:
        db.rollback()
        raise
    emit_dte.delay(emision.id)
    return emision


# ── Webhook ────────────────────────────────────────────────────────────────────

@router.post("/webhook", status_code=200)
async def webhook_lioren(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Lioren-Signature", "")
    svc = get_dte_service()
    if not svc.validate_webhook_signature(body, signature):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    track_id = data.get("track_id")
    if not track_id:
        return {"ok": True}
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        emision = db.query(DteEmision).filter_by(track_id=track_id).first()
        if not emision:
            return {"ok": True}
        # Don't overwrite terminal states
        if emision.estado in ("aceptada", "rechazada"):
            return {"ok": True}
        nuevo_estado = _lioren_to_estado(data.get("estado", "procesando"))
        emision.estado = nuevo_estado
        emision.respuesta_sii = data
        if nuevo_estado == "aceptada":
            emision.aceptado_at = datetime.now(timezone.utc)
        _sync_dte_estado(db, emision, nuevo_estado)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return {"ok": True}


# ── DteEmision detalle ─────────────────────────────────────────────────────────

@router.get("/emision/{emision_id}", response_model=DteEmisionOut)
def get_emision(
    emision_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    emision = db.query(DteEmision).filter_by(id=emision_id).first()
    if not emision:
        raise HTTPException(status_code=404, detail="Emisión no encontrada")
    return emision
