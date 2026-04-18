from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.permissions import has_permission
from app.database import get_db
from app.models.user import User


def require_permission(module: str, action: str):
    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> tuple[User, Session]:
        if not has_permission(db, current_user, module, action):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
        return current_user, db
    return Depends(dependency)
