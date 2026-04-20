from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class EmpresaBase(BaseModel):
    nombre: str
    razon_social: str | None = None
    rut: str | None = None
    forma_pago: str | None = None
    linea_credito: Decimal | None = None
    limite_credito: Decimal | None = None
    plazo_credito: str | None = None
    prioridad: str | None = None
    sector: str | None = None
    email: str | None = None
    nota_cobranza: str | None = None
    ubicacion: str | None = None


class EmpresaCreate(EmpresaBase):
    pass


class EmpresaUpdate(BaseModel):
    nombre: str | None = None
    razon_social: str | None = None
    rut: str | None = None
    forma_pago: str | None = None
    linea_credito: Decimal | None = None
    limite_credito: Decimal | None = None
    plazo_credito: str | None = None
    prioridad: str | None = None
    sector: str | None = None
    email: str | None = None
    nota_cobranza: str | None = None
    ubicacion: str | None = None


class EmpresaRef(BaseModel):
    id: int
    nombre: str
    razon_social: str | None = None
    rut: str | None = None
    model_config = {"from_attributes": True}


class EmpresaOut(EmpresaBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}
