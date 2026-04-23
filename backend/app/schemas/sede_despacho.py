from datetime import datetime
from pydantic import BaseModel


class SedeDespachoCreate(BaseModel):
    empresa_id: int
    nombre: str
    direccion: str


class SedeDespachoUpdate(BaseModel):
    nombre: str | None = None
    direccion: str | None = None


class SedeDespachoRef(BaseModel):
    id: int
    nombre: str
    direccion: str
    model_config = {"from_attributes": True}


class SedeDespachoOut(BaseModel):
    id: int
    empresa_id: int
    nombre: str
    direccion: str
    created_at: datetime
    model_config = {"from_attributes": True}
