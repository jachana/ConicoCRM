from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, field_validator


METODOS_PAGO_BOLETA = {"efectivo", "debito", "credito", "transferencia", "otro"}
TIPOS_DTE_BOLETA = {"39", "41"}
RUT_GENERICO = "66666666-6"


def _normalizar_patente(patente: str | None) -> str | None:
    if not patente:
        return None
    return patente.replace(" ", "").replace("-", "").upper()


class BoletaLineaCreate(BaseModel):
    orden: int = 0
    producto_id: int | None = None
    descripcion: str
    cantidad: Decimal = Field(Decimal("1"), gt=0)
    precio_unitario: Decimal = Field(Decimal("0"), ge=0)
    descuento_pct: Decimal = Field(Decimal("0"), ge=0, le=100)
    exenta: bool = False


class BoletaLineaOut(BoletaLineaCreate):
    id: int
    total_neto: Decimal
    iva: Decimal
    total_linea: Decimal
    model_config = {"from_attributes": True}


class BoletaCreate(BaseModel):
    fecha: date | None = None
    tipo_dte: Literal["39", "41"] = "39"
    cliente_id: int | None = None
    empresa_id: int | None = None
    patente_vehiculo: str | None = None
    email_envio: str | None = None
    nombre_receptor: str | None = None
    rut_receptor: str | None = None
    metodo_pago: Literal["efectivo", "debito", "credito", "transferencia", "otro"] = "efectivo"
    monto_pagado: Decimal | None = None
    lineas: list[BoletaLineaCreate]

    @field_validator("patente_vehiculo")
    @classmethod
    def normalizar_patente(cls, v: str | None) -> str | None:
        return _normalizar_patente(v)

    @field_validator("lineas")
    @classmethod
    def lineas_no_vacias(cls, v: list[BoletaLineaCreate]) -> list[BoletaLineaCreate]:
        if not v:
            raise ValueError("Boleta requiere al menos una línea")
        return v


class BoletaUpdate(BaseModel):
    """Solo metadata accesoria. Sin líneas, sin totales, sin tipo_dte."""
    patente_vehiculo: str | None = None
    email_envio: str | None = None
    nombre_receptor: str | None = None

    @field_validator("patente_vehiculo")
    @classmethod
    def normalizar_patente(cls, v: str | None) -> str | None:
        return _normalizar_patente(v)


class ClienteMinOut(BaseModel):
    id: int
    nombre: str
    rut: str | None = None
    model_config = {"from_attributes": True}


class VendedorMinOut(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class BoletaOut(BaseModel):
    id: int
    numero: int
    fecha: date
    tipo_dte: str
    cliente_id: int | None = None
    empresa_id: int | None = None
    patente_vehiculo: str | None = None
    email_envio: str | None = None
    nombre_receptor: str | None = None
    rut_receptor: str | None = None
    vendedor_id: int | None = None
    metodo_pago: str
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    monto_pagado: Decimal
    estado: str
    dte_estado: str
    folio_sii: int | None = None
    track_id: str | None = None
    email_enviado_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    lineas: list[BoletaLineaOut] = []
    is_locked: bool
    model_config = {"from_attributes": True}


class BoletaListOut(BaseModel):
    id: int
    numero: int
    fecha: date
    tipo_dte: str
    cliente_id: int | None = None
    nombre_receptor: str | None = None
    patente_vehiculo: str | None = None
    metodo_pago: str
    total: Decimal
    estado: str
    dte_estado: str
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    model_config = {"from_attributes": True}
