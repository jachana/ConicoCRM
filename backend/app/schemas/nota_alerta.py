from datetime import datetime
from pydantic import BaseModel


class NotaAlertaCreate(BaseModel):
    contenido: str


class NotaAlertaUpdate(BaseModel):
    contenido: str | None = None
    estado: str | None = None


class NotaAlertaOut(BaseModel):
    id: int
    cotizacion_id: int
    contenido: str
    estado: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
