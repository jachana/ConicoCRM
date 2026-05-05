"""Vendor-initiated discount approval workflow.

A vendor cannot apply a discount above the configurable free-discount
threshold (`descuento_umbral_libre_pct`) directly. Instead they create a
SolicitudDescuento with proposed per-line discounts; admin/subadmin approve
or reject. While a request is pending, the cotización's emisión (PDF /
email) is blocked.
"""
import json
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.api.deps import require_modulo
from app.database import get_db
from app.models.cotizacion import Cotizacion, CotizacionLinea
from app.models.producto import Producto
from app.models.solicitud_descuento import SolicitudDescuento
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.solicitud_descuento import (
    DescuentoStatusOut,
    SolicitudDescuentoAccion,
    SolicitudDescuentoCreate,
    SolicitudDescuentoOut,
)
from app.services.notifications import create_for_users, create_notification

router = APIRouter(dependencies=[require_modulo("aprobaciones_descuento")])


def get_umbral_libre_pct(db: Session) -> Decimal:
    """Return the configured max free-discount percentage (default 5%)."""
    cfg = db.get(SystemConfig, "descuento_umbral_libre_pct")
    if not cfg:
        return Decimal("5")
    try:
        return Decimal(cfg.value)
    except (ValueError, ArithmeticError):
        return Decimal("5")


def lineas_exceed_umbral(lineas, umbral: Decimal) -> bool:
    return any(Decimal(l.descuento) > umbral for l in lineas)


def check_descuento_approval_required(db: Session, cotizacion_id: int) -> bool:
    """True iff cotización has any line.descuento > umbral with no aprobada solicitud."""
    cot = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.lineas))
        .filter(Cotizacion.id == cotizacion_id)
        .first()
    )
    if not cot:
        return False
    umbral = get_umbral_libre_pct(db)
    if not lineas_exceed_umbral(cot.lineas, umbral):
        return False
    aprobada = (
        db.query(SolicitudDescuento)
        .filter(
            SolicitudDescuento.cotizacion_id == cotizacion_id,
            SolicitudDescuento.estado == "aprobada",
        )
        .first()
    )
    return aprobada is None


def _load(db: Session, solicitud_id: int) -> SolicitudDescuento:
    s = (
        db.query(SolicitudDescuento)
        .options(
            joinedload(SolicitudDescuento.vendedor),
            joinedload(SolicitudDescuento.revisor),
        )
        .filter(SolicitudDescuento.id == solicitud_id)
        .first()
    )
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    return s


def _admin_user_ids(db: Session, exclude: int | None = None) -> list[int]:
    q = db.query(User.id).filter(User.role.in_(("admin", "subadmin")))
    if exclude is not None:
        q = q.filter(User.id != exclude)
    return [uid for (uid,) in q.all()]


@router.get("/status/{cotizacion_id}", response_model=DescuentoStatusOut)
def descuento_status(
    cotizacion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cot = db.query(Cotizacion).filter(Cotizacion.id == cotizacion_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    blocked = check_descuento_approval_required(db, cotizacion_id)
    latest = (
        db.query(SolicitudDescuento)
        .filter(SolicitudDescuento.cotizacion_id == cotizacion_id)
        .order_by(SolicitudDescuento.created_at.desc())
        .first()
    )
    return DescuentoStatusOut(
        blocked=blocked,
        estado=latest.estado if latest else None,
        solicitud_id=latest.id if latest else None,
        umbral_libre_pct=float(get_umbral_libre_pct(db)),
    )


@router.post("/", response_model=SolicitudDescuentoOut, status_code=status.HTTP_201_CREATED)
def crear_solicitud_descuento(
    body: SolicitudDescuentoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cot = db.query(Cotizacion).filter(Cotizacion.id == body.cotizacion_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if not body.lineas_propuestas:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debe incluir al menos una línea propuesta",
        )
    for lp in body.lineas_propuestas:
        if lp.descuento_propuesto < 0 or lp.descuento_propuesto > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Descuento propuesto debe estar entre 0 y 100",
            )

    # "Latest wins": auto-deny any existing pending request for this cotizacion
    existing = (
        db.query(SolicitudDescuento)
        .filter(
            SolicitudDescuento.cotizacion_id == body.cotizacion_id,
            SolicitudDescuento.estado == "pendiente",
        )
        .first()
    )
    if existing:
        existing.estado = "rechazada"
        existing.comentario_revisor = "Reemplazada por nueva solicitud"
        db.flush()

    solicitud = SolicitudDescuento(
        cotizacion_id=body.cotizacion_id,
        vendedor_id=current_user.id,
        nota=body.nota,
        estado="pendiente",
        lineas_propuestas=json.dumps([lp.model_dump() for lp in body.lineas_propuestas]),
    )
    db.add(solicitud)
    db.flush()

    admin_ids = _admin_user_ids(db, exclude=current_user.id)
    if admin_ids:
        create_for_users(
            db,
            user_ids=admin_ids,
            tipo="aprobacion_pendiente",
            titulo=f"Descuento por aprobar — Cotización {cot.numero}",
            cuerpo=(body.nota or None),
            payload={
                "solicitud_descuento_id": solicitud.id,
                "cotizacion_id": cot.id,
                "cotizacion_numero": cot.numero,
                "vendedor_id": current_user.id,
                "vendedor_nombre": current_user.name,
            },
        )

    db.commit()
    return _load(db, solicitud.id)


@router.get("/", response_model=list[SolicitudDescuentoOut])
def listar_solicitudes_descuento(
    estado: str | None = Query(None),
    cotizacion_id: int | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(SolicitudDescuento).options(
        joinedload(SolicitudDescuento.vendedor),
        joinedload(SolicitudDescuento.revisor),
    )
    if current_user.role not in ("admin", "subadmin"):
        q = q.filter(SolicitudDescuento.vendedor_id == current_user.id)
    if estado:
        q = q.filter(SolicitudDescuento.estado == estado)
    if cotizacion_id:
        q = q.filter(SolicitudDescuento.cotizacion_id == cotizacion_id)
    return q.order_by(SolicitudDescuento.created_at.desc()).all()


@router.get("/{solicitud_id}", response_model=SolicitudDescuentoOut)
def obtener_solicitud_descuento(
    solicitud_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = _load(db, solicitud_id)
    if current_user.role not in ("admin", "subadmin") and s.vendedor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return s


@router.patch("/{solicitud_id}", response_model=SolicitudDescuentoOut)
def accionar_solicitud_descuento(
    solicitud_id: int,
    body: SolicitudDescuentoAccion,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = _load(db, solicitud_id)

    if body.accion == "revocar":
        if s.vendedor_id != current_user.id and current_user.role not in ("admin", "subadmin"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
        if s.estado != "pendiente":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Solo se pueden revocar solicitudes pendientes",
            )
        s.estado = "revocada"
        s.comentario_revisor = body.comentario
        db.commit()
        return _load(db, s.id)

    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden aprobar o rechazar",
        )
    if s.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La solicitud ya fue procesada",
        )

    if body.accion == "rechazar":
        s.estado = "rechazada"
        s.revisor_id = current_user.id
        s.comentario_revisor = body.comentario
    elif body.accion == "aprobar":
        cot = (
            db.query(Cotizacion)
            .options(joinedload(Cotizacion.lineas))
            .filter(Cotizacion.id == s.cotizacion_id)
            .first()
        )
        if not cot:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
        lineas_data = json.loads(s.lineas_propuestas)
        lineas_by_id = {l.id: l for l in cot.lineas}
        for item in lineas_data:
            linea = lineas_by_id.get(item["linea_id"])
            if not linea:
                continue
            nuevo_desc = Decimal(str(item["descuento_propuesto"]))
            linea.descuento = nuevo_desc
            linea.total_neto = linea.cantidad * linea.valor_neto * (Decimal("1") - nuevo_desc / Decimal("100"))
            linea.iva = round(linea.total_neto * Decimal("0.19"), 2)
            linea.total = linea.total_neto + linea.iva
            if linea.producto_id:
                prod = db.get(Producto, linea.producto_id)
                if prod:
                    precio_efectivo = linea.valor_neto * (Decimal("1") - nuevo_desc / Decimal("100"))
                    linea.margen = (
                        (precio_efectivo - prod.precio_costo) / precio_efectivo
                        if precio_efectivo > 0
                        else Decimal("0")
                    )
        cot.total_neto = sum(l.total_neto for l in cot.lineas)
        cot.total_iva = sum(l.iva for l in cot.lineas)
        cot.total = sum(l.total for l in cot.lineas)
        s.estado = "aprobada"
        s.revisor_id = current_user.id
        s.comentario_revisor = body.comentario
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Acción inválida",
        )

    if s.vendedor_id and s.vendedor_id != current_user.id:
        cot_numero = (
            db.query(Cotizacion.numero).filter(Cotizacion.id == s.cotizacion_id).scalar()
            if s.cotizacion_id
            else None
        )
        verbo = "aprobada" if s.estado == "aprobada" else "rechazada"
        create_notification(
            db,
            user_id=s.vendedor_id,
            tipo="aprobacion_resuelta",
            titulo=f"Tu solicitud de descuento fue {verbo}",
            cuerpo=body.comentario,
            payload={
                "solicitud_descuento_id": s.id,
                "cotizacion_id": s.cotizacion_id,
                "cotizacion_numero": cot_numero,
                "estado": s.estado,
                "revisor_id": current_user.id,
                "revisor_nombre": current_user.name,
            },
        )

    db.commit()
    return _load(db, s.id)
