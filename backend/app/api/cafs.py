from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.caf import CAF
from app.models.user import User

router = APIRouter()

_URGENCY_ORDER = {"ambos": 0, "vencimiento": 1, "stock": 2}
_EXPIRY_DAYS = 30
_LOW_STOCK_RATIO = 0.9


def _build_alert(caf: CAF, today=None):
    if today is None:
        today = date.today()
    total = caf.num_fin - caf.num_inicio + 1
    consumido = caf.consumido
    folios_restantes = total - consumido
    porcentaje = round(consumido / total * 100, 2) if total else 0.0
    dias = (caf.fecha_vencimiento - today).days if caf.fecha_vencimiento else None
    low = caf.is_low_stock()
    exp = caf.is_expiring_soon()
    if low and exp:
        urgencia = "ambos"
    elif exp:
        urgencia = "vencimiento"
    else:
        urgencia = "stock"
    return {
        "id": caf.id,
        "tipo_dte": caf.tipo_dte,
        "folios_restantes": folios_restantes,
        "total_folios": total,
        "porcentaje_consumido": porcentaje,
        "fecha_vencimiento": caf.fecha_vencimiento.isoformat() if caf.fecha_vencimiento else None,
        "dias_al_vencimiento": dias,
        "is_low_stock": low,
        "is_expiring_soon": exp,
        "urgencia": urgencia,
    }


def _sort_key(alert: dict):
    urgency_rank = _URGENCY_ORDER.get(alert["urgencia"], 99)
    dias = alert["dias_al_vencimiento"]
    dias_sort = dias if dias is not None else float("inf")
    return (urgency_rank, dias_sort)


@router.get("/alerts/")
def get_caf_alerts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    empresa_id = current_user.empresa_id
    if not empresa_id:
        return {"count": 0, "alerts": []}

    today = date.today()
    soon = today + timedelta(days=_EXPIRY_DAYS)
    total_expr = CAF.num_fin - CAF.num_inicio + 1

    cafs = db.query(CAF).filter(
        CAF.empresa_id == empresa_id,
        CAF.vigente == True,  # noqa: E712
        or_(
            (CAF.consumido * 1.0 / total_expr) >= _LOW_STOCK_RATIO,
            and_(CAF.fecha_vencimiento.isnot(None), CAF.fecha_vencimiento < soon),
        ),
    ).all()

    alerts = sorted([_build_alert(c, today) for c in cafs], key=_sort_key)
    return {"count": len(alerts), "alerts": alerts}
