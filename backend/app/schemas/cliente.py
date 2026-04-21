from datetime import datetime, date
from pydantic import BaseModel
from app.schemas.empresa import EmpresaRef


class ClienteBase(BaseModel):
    nombre: str
    rut: str
    email: str | None = None
    telefono: str | None = None
    direccion_despacho: str | None = None
    notas: str | None = None
    empresa_id: int | None = None
    recibe_correo: bool = True
    despacho_o_retiro: str | None = None
    comuna: str | None = None
    ultimo_contacto: date | None = None
    forma_pago: str | None = None
    forma_captacion: str | None = None
    compromiso: str | None = None
    es_nuevo: bool = False


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nombre: str | None = None
    rut: str | None = None
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


class ClienteOut(ClienteBase):
    id: int
    empresa: EmpresaRef | None = None
    created_at: datetime
    model_config = {"from_attributes": True}
