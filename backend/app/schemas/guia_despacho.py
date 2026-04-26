from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, field_validator


class GuiaDespachoLineaCreate(BaseModel):
    orden: int = 0
    producto_id: int | None = None
    descripcion: str
    cantidad: Decimal = Decimal("1")
    precio_unitario: Decimal = Decimal("0")
    descuento_pct: Decimal = Decimal("0")
    exenta: bool = False


class GuiaDespachoLineaOut(GuiaDespachoLineaCreate):
    id: int
    total_neto: Decimal
    iva: Decimal
    total_linea: Decimal
    model_config = ConfigDict(from_attributes=True)


class GuiaDespachoCreate(BaseModel):
    fecha: date | None = None
    motivo_traslado: Literal[1, 2, 3, 4, 5, 6, 7, 8, 9]  # D-05
    direccion_destino: str | None = None
    comuna_destino: str | None = None
    cliente_id: int | None = None
    empresa_id: int | None = None
    nota_venta_id: int | None = None  # D-04: opcional, no bloquea NV
    email_envio: str | None = None
    lineas: list[GuiaDespachoLineaCreate]

    @field_validator("lineas")
    @classmethod
    def lineas_no_vacias(cls, v):
        if not v:
            raise ValueError("Guía requiere al menos una línea")
        return v


class GuiaDespachoUpdate(BaseModel):
    """D-06: solo metadata accesoria."""
    direccion_destino: str | None = None
    comuna_destino: str | None = None
    email_envio: str | None = None


class ClienteMinOut(BaseModel):
    id: int
    nombre: str
    rut: str | None = None
    model_config = ConfigDict(from_attributes=True)


class VendedorMinOut(BaseModel):
    id: int
    username: str
    model_config = ConfigDict(from_attributes=True)


class GuiaDespachoOut(BaseModel):
    id: int
    numero: int
    fecha: date
    motivo_traslado: int
    direccion_destino: str | None
    comuna_destino: str | None
    cliente_id: int | None
    empresa_id: int | None
    nota_venta_id: int | None
    email_envio: str | None
    vendedor_id: int | None
    estado: str
    dte_estado: str
    track_id: str | None
    folio_sii: int | None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    email_enviado_at: datetime | None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    lineas: list[GuiaDespachoLineaOut] = []
    model_config = ConfigDict(from_attributes=True)


class GuiaDespachoListOut(BaseModel):
    """D-33: lista sin líneas para performance."""
    id: int
    numero: int
    fecha: date
    cliente_id: int | None
    motivo_traslado: int
    total: Decimal
    estado: str
    dte_estado: str
    track_id: str | None
    model_config = ConfigDict(from_attributes=True)


class GuiaEmailBody(BaseModel):
    email: str | None = None
