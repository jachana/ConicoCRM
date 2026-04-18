from datetime import datetime
from pydantic import BaseModel


class ProveedorBase(BaseModel):
    nombre: str
    rut: str | None = None
    contacto: str | None = None
    email: str | None = None
    telefono: str | None = None
    notas: str | None = None


class ProveedorCreate(ProveedorBase):
    pass


class ProveedorUpdate(BaseModel):
    nombre: str | None = None
    rut: str | None = None
    contacto: str | None = None
    email: str | None = None
    telefono: str | None = None
    notas: str | None = None


class ProveedorOut(ProveedorBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}
