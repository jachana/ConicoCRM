from typing import Optional
from sqlalchemy.orm import Session
from app.models.user import User


def _primer_admin_activo(db: Session) -> int:
    u = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).order_by(User.id).first()
    if u is None:
        raise RuntimeError("No hay admins activos para asignar tareas")
    return u.id


def _primer_vendedor_activo(db: Session) -> int:
    u = db.query(User).filter(User.role == "vendedor", User.is_active.is_(True)).order_by(User.id).first()
    return u.id if u else _primer_admin_activo(db)


def resolver_asignado(db: Session, asignado_rol: str, entidad_vendedor_id: Optional[int]) -> int:
    """
    asignado_rol: 'owner' | 'vendedor' | 'admin'
    entidad_vendedor_id: vendedor_id de la entidad origen (para 'owner')
    """
    if asignado_rol == "admin":
        return _primer_admin_activo(db)
    if asignado_rol == "vendedor":
        return _primer_vendedor_activo(db)
    if asignado_rol == "owner":
        if entidad_vendedor_id is not None:
            u = db.query(User).filter(User.id == entidad_vendedor_id, User.is_active.is_(True)).first()
            if u is not None:
                return u.id
        return _primer_admin_activo(db)
    raise ValueError(f"asignado_rol inválido: {asignado_rol}")
