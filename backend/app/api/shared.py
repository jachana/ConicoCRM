from sqlalchemy.orm import Session

from app.models.empresa import Empresa


def enforce_al_contado(empresa_id: int | None, terminos_pago: str | None, db: Session) -> str | None:
    """Return 'al_contado' when the empresa has no credit line, otherwise return terminos_pago unchanged."""
    if not empresa_id:
        return terminos_pago
    empresa = db.get(Empresa, empresa_id)
    if empresa and (empresa.linea_credito is None or empresa.linea_credito <= 0):
        return "al_contado"
    return terminos_pago
