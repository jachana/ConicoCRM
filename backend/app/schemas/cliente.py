from datetime import datetime, date
from pydantic import BaseModel, field_validator
from app.schemas.empresa import EmpresaRef
from app.utils.rut import validate_rut


def _check_rut(v: str | None) -> str | None:
    if v and not validate_rut(v):
        raise ValueError("RUT con dígito verificador inválido")
    return v


class ClienteBase(BaseModel):
    nombre: str
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    direccion_despacho: str | None = None
    notas: str | None = None
    empresa_id: int | None = None
    vendedor_id: int | None = None
    recibe_correo: bool = True
    despacho_o_retiro: str | None = None
    comuna: str | None = None
    ultimo_contacto: date | None = None
    forma_pago: str | None = None
    forma_captacion: str | None = None
    compromiso: str | None = None
    es_nuevo: bool = False


class ClienteCreate(ClienteBase):
    @field_validator("rut")
    @classmethod
    def validar_rut(cls, v: str | None) -> str | None:
        return _check_rut(v)


class ClienteUpdate(BaseModel):
    nombre: str | None = None
    rut: str | None = None

    @field_validator("rut")
    @classmethod
    def validar_rut(cls, v: str | None) -> str | None:
        return _check_rut(v)
    email: str | None = None
    telefono: str | None = None
    direccion_despacho: str | None = None
    notas: str | None = None
    empresa_id: int | None = None
    recibe_correo: bool | None = None
    despacho_o_retiro: str | None = None
    comuna: str | None = None
    ultimo_contacto: date | None = None
    forma_pago: str | None = None
    forma_captacion: str | None = None
    compromiso: str | None = None
    es_nuevo: bool | None = None
    vendedor_id: int | None = None


class ClienteOut(ClienteBase):
    id: int
    empresa: EmpresaRef | None = None
    created_at: datetime
    model_config = {"from_attributes": True}
