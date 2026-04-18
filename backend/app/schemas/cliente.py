from datetime import datetime
from pydantic import BaseModel


class ClienteBase(BaseModel):
    nombre: str
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    direccion: str | None = None
    notas: str | None = None


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nombre: str | None = None
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    direccion: str | None = None
    notas: str | None = None


class ClienteOut(ClienteBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}
