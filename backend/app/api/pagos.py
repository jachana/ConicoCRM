from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.database import get_db
from app.models.factura import Factura
from app.models.pago import Pago
from app.models.user import User
from app.schemas.pago import PagoCreate, PagoOut

router = APIRouter()

_METODOS_PAGO = {"efectivo", "transferencia", "cheque", "debito", "credito", "deposito"}


def _recalcular_estado_factura(db: Session, factura: Factura) -> None:
    pagos = db.query(Pago).filter(Pago.factura_id == factura.id).all()
    total_pagado = sum(p.monto for p in pagos) if pagos else Decimal("0")
    factura.monto_pagado = total_pagado
    if factura.estado == "anulada":
        return
    if total_pagado >= factura.total and total_pagado > 0:
        factura.estado = "pagada"
        factura.fecha_pago = max(p.fecha for p in pagos)
        last = max(pagos, key=lambda p: p.fecha)
        factura.metodo_pago = last.metodo_pago
    elif total_pagado > 0:
        factura.estado = "parcial"
        factura.fecha_pago = None
    else:
        factura.estado = "emitida"
        factura.fecha_pago = None
        factura.metodo_pago = None


def _load_pago(db: Session, pago_id: int) -> Pago:
    pago = (
        db.query(Pago)
        .options(joinedload(Pago.registrado_por), joinedload(Pago.factura))
        .filter(Pago.id == pago_id)
        .first()
    )
    if not pago:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago no encontrado")
    return pago


@router.get("/", response_model=list[PagoOut])
def listar_pagos(
    factura_id: int | None = Query(None),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _, db = perms
    q = db.query(Pago).options(joinedload(Pago.registrado_por), joinedload(Pago.factura))
    if factura_id:
        q = q.filter(Pago.factura_id == factura_id)
    return q.order_by(Pago.fecha.desc(), Pago.id.desc()).all()


@router.post("/", response_model=PagoOut, status_code=status.HTTP_201_CREATED)
def crear_pago(
    body: PagoCreate,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    current_user, db = perms
    if body.metodo_pago not in _METODOS_PAGO:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"metodo_pago inválido. Valores: {', '.join(sorted(_METODOS_PAGO))}",
        )
    if body.monto <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El monto debe ser mayor a 0",
        )
    factura = db.query(Factura).options(joinedload(Factura.pagos)).filter(Factura.id == body.factura_id).first()
    if not factura:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Factura no encontrada")
    if factura.estado == "anulada":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede registrar un pago en una factura anulada",
        )
    pago = Pago(
        factura_id=body.factura_id,
        fecha=body.fecha,
        monto=body.monto,
        metodo_pago=body.metodo_pago,
        nota=body.nota,
        registrado_por_id=current_user.id,
    )
    db.add(pago)
    db.flush()
    _recalcular_estado_factura(db, factura)
    db.commit()
    return _load_pago(db, pago.id)


@router.delete("/{pago_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_pago(
    pago_id: int,
    perms: tuple[User, Session] = require_permission("facturas", "edit"),
):
    current_user, db = perms
    if current_user.role not in ("admin", "subadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin/subadmin puede eliminar pagos")
    pago = db.get(Pago, pago_id)
    if not pago:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago no encontrado")
    factura = db.query(Factura).options(joinedload(Factura.pagos)).filter(Factura.id == pago.factura_id).first()
    db.delete(pago)
    db.flush()
    if factura:
        _recalcular_estado_factura(db, factura)
    db.commit()
