from datetime import datetime
from pydantic import BaseModel


class MarcaOut(BaseModel):
    id: int
    nombre: str
    activa: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class MarcaCreate(BaseModel):
    nombre: str


class MarcaUpdate(BaseModel):
    nombre: str | None = None
    activa: bool | None = None
