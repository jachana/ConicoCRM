from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.nota_alerta import TipoAlerta, EstadoAlerta


class NotaAlertaCreate(BaseModel):
    contenido: str
    tipo: TipoAlerta = TipoAlerta.CUSTOM
    monto: Optional[Decimal] = None
    expires_at: Optional[datetime] = None


class NotaAlertaUpdate(BaseModel):
    contenido: str | None = None
    estado: Optional[EstadoAlerta] = None
    tipo: Optional[TipoAlerta] = None
    monto: Optional[Decimal] = None
    expires_at: Optional[datetime] = None


class NotaAlertaOut(BaseModel):
    id: int
    cotizacion_id: int
    contenido: str
    tipo: TipoAlerta
    monto: Optional[Decimal]
    estado: EstadoAlerta
    expires_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
