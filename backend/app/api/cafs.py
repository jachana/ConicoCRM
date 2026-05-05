"""
CAF Alerts API

Endpoint for retrieving CAFs in alert state (low stock or expiring soon)
for the current user's empresa.

Endpoints:
  GET /api/cafs/alerts/ - List CAFs in alert state for current user's empresa
"""

from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.caf import CAF
from app.models.user import User

router = APIRouter()

_URGENCY_ORDER = {"ambos": 0, "vencimiento": 1, "stock": 2}


def _days_to_expiry(fecha_vencimiento: date | None) -> int | None:
    if fecha_vencimiento is None:
        return None
    return (fecha_vencimiento - date.today()).days


def _build_alert(caf: CAF) -> dict:
    low_stock = caf.is_low_stock()
    expiring = caf.is_expiring_soon()

    if low_stock and expiring:
        urgencia = "ambos"
    elif expiring:
        urgencia = "vencimiento"
    else:
        urgencia = "stock"

    total = caf.num_fin - caf.num_inicio + 1
    folios_restantes = total - caf.consumido
    porcentaje = round((caf.consumido / total * 100) if total else 0.0, 2)
    dias = _days_to_expiry(caf.fecha_vencimiento)

    return {
        "id": caf.id,
        "tipo_dte": caf.tipo_dte,
        "folios_restantes": folios_restantes,
        "total_folios": total,
        "porcentaje_consumido": porcentaje,
        "fecha_vencimiento": caf.fecha_vencimiento.isoformat() if caf.fecha_vencimiento else None,
        "dias_al_vencimiento": dias,
        "is_low_stock": low_stock,
        "is_expiring_soon": expiring,
        "urgencia": urgencia,
    }


def _sort_key(alert: dict):
    urgency_rank = _URGENCY_ORDER.get(alert["urgencia"], 99)
    dias = alert["dias_al_vencimiento"]
    # Nulls last for days-to-expiry sort
    dias_sort = dias if dias is not None else float("inf")
    return (urgency_rank, dias_sort)


@router.get("/alerts/")
def get_caf_alerts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns CAFs in alert state for the current user's empresa, sorted by urgency."""
    empresa_id = current_user.empresa_id
    if not empresa_id:
        return {"count": 0, "alerts": []}

    cafs = (
        db.query(CAF)
        .filter(CAF.empresa_id == empresa_id, CAF.vigente == True)  # noqa: E712
        .all()
    )

    alert_cafs = [caf for caf in cafs if caf.is_low_stock() or caf.is_expiring_soon()]
    alerts = [_build_alert(caf) for caf in alert_cafs]
    alerts.sort(key=_sort_key)

    return {"count": len(alerts), "alerts": alerts}
