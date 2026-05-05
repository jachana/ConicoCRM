from datetime import datetime
from pydantic import BaseModel, field_validator
from app.utils.rut import validate_rut


def _check_rut(v: str | None) -> str | None:
    if v and not validate_rut(v):
        raise ValueError("RUT con dígito verificador inválido")
    return v


class ProveedorBase(BaseModel):
    nombre: str
    rut: str | None = None
    razon_social: str | None = None
    giro: str | None = None
    direccion: str | None = None
    comuna: str | None = None
    contacto: str | None = None
    email: str | None = None
    telefono: str | None = None
    condicion_pago: str | None = None
    notas: str | None = None


class ProveedorCreate(ProveedorBase):
    @field_validator("rut")
    @classmethod
    def validar_rut(cls, v: str | None) -> str | None:
        return _check_rut(v)


class ProveedorUpdate(BaseModel):
    nombre: str | None = None
    rut: str | None = None

    @field_validator("rut")
    @classmethod
    def validar_rut(cls, v: str | None) -> str | None:
        return _check_rut(v)
    razon_social: str | None = None
    giro: str | None = None
    direccion: str | None = None
    comuna: str | None = None
    contacto: str | None = None
    email: str | None = None
    telefono: str | None = None
    condicion_pago: str | None = None
    notas: str | None = None


class ProveedorOut(ProveedorBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}
