from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class NotaCreditoLineaCreate(BaseModel):
    orden: int = 0
    descripcion: str
    cantidad: Decimal = Decimal("1")
    precio_unitario: Decimal = Decimal("0")


class NotaCreditoLineaOut(NotaCreditoLineaCreate):
    id: int
    subtotal: Decimal
    model_config = {"from_attributes": True}


class NotaCreditoCreate(BaseModel):
    fecha: date | None = None
    cliente_id: int
    razon: str
    lineas: list[NotaCreditoLineaCreate] = []


class NotaCreditoOut(BaseModel):
    id: int
    numero: int
    fecha: date
    cliente_id: int
    razon: str
    monto_neto: Decimal
    monto_iva: Decimal
    monto_total: Decimal
    dte_estado: str
    created_at: datetime
    lineas: list[NotaCreditoLineaOut] = []
    model_config = {"from_attributes": True}


class NotaDebitoLineaCreate(BaseModel):
    orden: int = 0
    descripcion: str
    cantidad: Decimal = Decimal("1")
    precio_unitario: Decimal = Decimal("0")


class NotaDebitoLineaOut(NotaDebitoLineaCreate):
    id: int
    subtotal: Decimal
    model_config = {"from_attributes": True}


class NotaDebitoCreate(BaseModel):
    fecha: date | None = None
    cliente_id: int
    razon: str
    lineas: list[NotaDebitoLineaCreate] = []


class NotaDebitoOut(BaseModel):
    id: int
    numero: int
    fecha: date
    cliente_id: int
    razon: str
    monto_neto: Decimal
    monto_iva: Decimal
    monto_total: Decimal
    dte_estado: str
    created_at: datetime
    lineas: list[NotaDebitoLineaOut] = []
    model_config = {"from_attributes": True}


class DteEmisionOut(BaseModel):
    id: int
    tipo: str
    folio: int | None
    track_id: str | None
    estado: str
    monto_neto: int
    monto_iva: int
    monto_total: int
    intentos_poll: int
    respuesta_sii: dict | None
    created_at: datetime
    emitido_at: datetime | None
    aceptado_at: datetime | None
    model_config = {"from_attributes": True}
