from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class NotaAlertaCreate(BaseModel):
    contenido: str
    tipo: str = "custom"
    monto: Optional[Decimal] = None
    expires_at: Optional[datetime] = None


class NotaAlertaUpdate(BaseModel):
    contenido: str | None = None
    estado: str | None = None
    tipo: str | None = None
    monto: Optional[Decimal] = None
    expires_at: Optional[datetime] = None


class NotaAlertaOut(BaseModel):
    id: int
    cotizacion_id: int
    contenido: str
    tipo: str
    monto: Optional[Decimal]
    estado: str
    expires_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
