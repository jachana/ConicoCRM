from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.permission import PermissionOverride
from app.schemas.user import UserOut, UserCreate, UserUpdate
from app.core.security import get_password_hash
from app.core.permissions import get_user_permissions, MODULES, ACTIONS
from app.api.auth import get_current_user

router = APIRouter()

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user

@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(User).all()

@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=body.email, name=body.name,
        hashed_password=get_password_hash(body.password), role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.hashed_password = get_password_hash(body.password)
    db.commit()
    db.refresh(user)
    return user

@router.get("/me/permissions")
def get_my_permissions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_user_permissions(db, current_user)

@router.get("/{user_id}/permissions")
def get_permissions(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return get_user_permissions(db, user)

@router.put("/{user_id}/permissions")
def set_permissions(
    user_id: int,
    body: dict[str, dict[str, bool]],
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for module, actions in body.items():
        if module not in MODULES:
            continue
        for action, allowed in actions.items():
            if action not in ACTIONS:
                continue
            override = db.query(PermissionOverride).filter_by(
                user_id=user_id, module=module, action=action
            ).first()
            if override:
                override.allowed = allowed
            else:
                db.add(PermissionOverride(user_id=user_id, module=module, action=action, allowed=allowed))
    db.commit()
    return get_user_permissions(db, user)
