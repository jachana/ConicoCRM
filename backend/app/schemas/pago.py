from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class PagoCreate(BaseModel):
    factura_id: int
    fecha: date
    monto: Decimal
    metodo_pago: str
    nota: str | None = None


class RegistradoPorOut(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class FacturaMinOut(BaseModel):
    id: int
    numero: int
    total: Decimal
    model_config = {"from_attributes": True}


class PagoOut(BaseModel):
    id: int
    factura_id: int
    fecha: date
    monto: Decimal
    metodo_pago: str
    nota: str | None = None
    registrado_por_id: int | None = None
    created_at: datetime
    registrado_por: RegistradoPorOut | None = None
    factura: FacturaMinOut | None = None
    model_config = {"from_attributes": True}
