from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.modulos import OPTIONAL_MODULES
from app.core.permissions import has_permission
from app.database import get_db
from app.models.empresa import Empresa
from app.models.user import User
from app.services.modulo_calculator import compute_effective_modulos


def require_permission(module: str, action: str):
    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> tuple[User, Session]:
        if not has_permission(db, current_user, module, action):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
        return current_user, db
    return Depends(dependency)


def require_modulo(slug: str):
    """FastAPI dependency that gates access to an optional module.

    Returns 403 with structured payload if the empresa has the module disabled.
    """
    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        empresa = db.get(Empresa, current_user.empresa_id) if current_user.empresa_id else None
        stored: dict[str, bool] = (empresa.modulos_enabled or {}) if empresa else {}
        effective = compute_effective_modulos(stored)
        if not effective.get(slug, True):
            spec = OPTIONAL_MODULES.get(slug)
            label = spec.label if spec else slug
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "modulo_disabled", "slug": slug, "label": label},
            )
        return current_user
    return Depends(dependency)
