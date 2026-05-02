from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.system_config import SystemConfig
from app.models.user import User
from app.schemas.cotizacion import SystemConfigOut, SystemConfigUpdate

router = APIRouter()

INITIAL_CONFIG = {
    "cotizacion_last_id": "12250",
    "orden_compra_last_id": "0",
    "empresa_nombre": "Distribuidora Conico Ltda.",
    "empresa_rut": "82.638.800-5",
    "empresa_direccion": "",
    "empresa_logo_url": "",
    "empresa_banco": "",
    "empresa_tipo_cuenta": "",
    "empresa_numero_cuenta": "",
    "empresa_nombre_titular": "",
    "dias_alerta_costo_desactualizado": "60",
    "descuento_umbral_libre_pct": "5",
}


def _ensure_config(db: Session) -> None:
    for key, value in INITIAL_CONFIG.items():
        if not db.get(SystemConfig, key):
            db.add(SystemConfig(key=key, value=value))
    db.commit()


def require_admin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[User, Session]:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administradores")
    return current_user, db


@router.get("/", response_model=list[SystemConfigOut])
def listar_config(perms: tuple[User, Session] = Depends(require_admin)):
    _, db = perms
    _ensure_config(db)
    return db.query(SystemConfig).all()


class IntegrationStatus(BaseModel):
    name: str
    configurada: bool
    mensaje: str


@router.get("/integration-status", response_model=list[IntegrationStatus])
def integration_status(perms: tuple[User, Session] = Depends(require_admin)):
    lioren_ok = bool(settings.lioren_api_key)
    smtp_ok = bool(settings.smtp_host and settings.smtp_user and settings.smtp_password)
    return [
        IntegrationStatus(
            name="lioren",
            configurada=lioren_ok,
            mensaje="API key configurada" if lioren_ok else "API key no configurada",
        ),
        IntegrationStatus(
            name="mail",
            configurada=smtp_ok,
            mensaje="SMTP configurado" if smtp_ok else "SMTP no configurado",
        ),
        IntegrationStatus(
            name="whatsapp",
            configurada=False,
            mensaje="No implementado aún",
        ),
    ]


@router.patch("/", response_model=list[SystemConfigOut])
def actualizar_config(
    body: SystemConfigUpdate,
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    _ensure_config(db)
    for key, value in body.updates.items():
        cfg = db.get(SystemConfig, key)
        if cfg:
            cfg.value = value
        else:
            db.add(SystemConfig(key=key, value=value))
    db.commit()
    return db.query(SystemConfig).all()
