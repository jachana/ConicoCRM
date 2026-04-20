import json
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.database import get_db
from app.models.aprobacion_margen import AprobacionMargen
from app.models.cotizacion import Cotizacion
from app.models.producto import Producto
from app.models.user import User
from app.schemas.aprobacion_margen import (
    AprobacionMargenAccion,
    AprobacionMargenCreate,
    AprobacionMargenOut,
)

router = APIRouter()


def _load(db: Session, aprobacion_id: int) -> AprobacionMargen:
    a = (
        db.query(AprobacionMargen)
        .options(joinedload(AprobacionMargen.vendedor))
        .filter(AprobacionMargen.id == aprobacion_id)
        .first()
    )
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    return a


@router.post("/", response_model=AprobacionMargenOut, status_code=status.HTTP_201_CREATED)
def crear_solicitud_margen(
    body: AprobacionMargenCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cot = db.query(Cotizacion).filter(Cotizacion.id == body.cotizacion_id).first()
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")
    if not body.lineas_propuestas:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Debe incluir al menos una línea propuesta")

    # "Latest wins": auto-deny any existing pending request for this cotizacion
    existing = (
        db.query(AprobacionMargen)
        .filter(
            AprobacionMargen.cotizacion_id == body.cotizacion_id,
            AprobacionMargen.estado == "pendiente",
        )
        .first()
    )
    if existing:
        existing.estado = "denegada"
        db.flush()

    aprobacion = AprobacionMargen(
        cotizacion_id=body.cotizacion_id,
        vendedor_id=current_user.id,
        nota=body.nota,
        estado="pendiente",
        lineas_propuestas=json.dumps([lp.model_dump() for lp in body.lineas_propuestas]),
    )
    db.add(aprobacion)
    db.commit()
    return _load(db, aprobacion.id)


@router.get("/", response_model=list[AprobacionMargenOut])
def listar_solicitudes_margen(
    estado: str | None = Query(None),
    cotizacion_id: int | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(AprobacionMargen).options(joinedload(AprobacionMargen.vendedor))
    if current_user.role not in ("admin", "subadmin"):
        q = q.filter(AprobacionMargen.vendedor_id == current_user.id)
    if estado:
        q = q.filter(AprobacionMargen.estado == estado)
    if cotizacion_id:
        q = q.filter(AprobacionMargen.cotizacion_id == cotizacion_id)
    return q.order_by(AprobacionMargen.created_at.desc()).all()


@router.get("/{aprobacion_id}", response_model=AprobacionMargenOut)
def obtener_solicitud_margen(
    aprobacion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = _load(db, aprobacion_id)
    if current_user.role not in ("admin", "subadmin") and a.vendedor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return a


@router.patch("/{aprobacion_id}", response_model=AprobacionMargenOut)
def accionar_solicitud_margen(
    aprobacion_id: int,
    body: AprobacionMargenAccion,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Solo administradores pueden aprobar")
    a = _load(db, aprobacion_id)
    if a.estado != "pendiente":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="La solicitud ya fue procesada")

    if body.accion == "denegar":
        a.estado = "denegada"
        db.commit()
        return _load(db, a.id)

    if body.accion != "aprobar":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Acción inválida")

    cot = (
        db.query(Cotizacion)
        .options(joinedload(Cotizacion.lineas))
        .filter(Cotizacion.id == a.cotizacion_id)
        .first()
    )
    if not cot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cotización no encontrada")

    lineas_data = json.loads(a.lineas_propuestas)
    lineas_by_id = {l.id: l for l in cot.lineas}

    for item in lineas_data:
        linea = lineas_by_id.get(item["linea_id"])
        if not linea:
            continue  # line deleted after request — skip gracefully
        nuevo_vn = Decimal(str(item["valor_neto_propuesto"]))
        linea.valor_neto = nuevo_vn
        linea.total_neto = linea.cantidad * nuevo_vn
        linea.iva = round(linea.total_neto * Decimal("0.19"), 2)
        linea.total = linea.total_neto + linea.iva
        if linea.producto_id and nuevo_vn > 0:
            prod = db.get(Producto, linea.producto_id)
            if prod:
                linea.margen = (nuevo_vn - prod.precio_costo) / nuevo_vn

    cot.total_neto = sum(l.total_neto for l in cot.lineas)
    cot.total_iva = sum(l.iva for l in cot.lineas)
    cot.total = sum(l.total for l in cot.lineas)

    a.estado = "aprobada"
    db.commit()
    return _load(db, a.id)
