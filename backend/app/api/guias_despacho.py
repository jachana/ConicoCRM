from datetime import date
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import require_permission
from app.api.dte import _next_numero
from app.models.dte_emision import DteEmision
from app.models.guia_despacho import GuiaDespacho, GuiaDespachoLinea
from app.models.user import User
from app.schemas.guia_despacho import (
    GuiaDespachoCreate,
    GuiaDespachoListOut,
    GuiaDespachoOut,
    GuiaDespachoUpdate,
)
from app.tasks.dte import emit_dte

router = APIRouter()


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
