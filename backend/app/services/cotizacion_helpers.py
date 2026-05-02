"""
Shared helpers for Cotizacion operations.

Extracted here to avoid duplication between cotizaciones.py and
onboarding_cotizaciones.py.
"""

from sqlalchemy.orm import Session

from app.models.system_config import SystemConfig


def asignar_numero(db: Session) -> int:
    """Assign the next Cotizacion numero using SystemConfig (atomic, with row lock)."""
    config = (
        db.query(SystemConfig)
        .filter_by(key="cotizacion_last_id")
        .with_for_update()
        .first()
    )
    if not config:
        config = SystemConfig(key="cotizacion_last_id", value="12250")
        db.add(config)
        db.flush()
    numero = int(config.value) + 1
    config.value = str(numero)
    return numero
