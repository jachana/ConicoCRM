from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal, Self
from app.schemas.empresa import EmpresaRef
from app.schemas.banco_receptor import BancoReceptorOut
from app.schemas.metodo_pago import METODOS_PAGO, validate_metodo_plazo


class FacturaLineaCreate(BaseModel):
    orden: int
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    formato: str | None = None
    cantidad: int = 1
    valor_neto: Decimal = Decimal("0")


class FacturaLineaOut(FacturaLineaCreate):
    id: int
    total_neto: Decimal
    iva: Decimal
    total: Decimal
    margen: Decimal | None = None
    model_config = {"from_attributes": True}


class FacturaCreate(BaseModel):
    cliente_id: int
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    fecha_vencimiento: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    banco_receptor_id: int | None = None
    nv_id: int | None = None
    metodo_pago: str | None = None
    plazo_dias: int = 0
    tipo_dte: Literal["033", "034"] = "033"
    lineas: list[FacturaLineaCreate] = []

    @model_validator(mode="after")
    def check_plazo_metodo(self) -> Self:
        validate_metodo_plazo(self.metodo_pago, self.plazo_dias)
        return self


class FacturaUpdate(BaseModel):
    cliente_id: int | None = None
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    fecha_vencimiento: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    banco_receptor_id: int | None = None
    metodo_pago: str | None = None
    plazo_dias: int | None = None
    referencias_docs: list | None = None
    exclude_recordatorio: bool | None = None

    @model_validator(mode="after")
    def check_plazo_metodo(self) -> Self:
        if self.metodo_pago is not None and self.plazo_dias is not None:
            validate_metodo_plazo(self.metodo_pago, self.plazo_dias)
        elif self.metodo_pago is not None and self.metodo_pago not in METODOS_PAGO:
            raise ValueError(f"metodo_pago inválido. Opciones: {sorted(METODOS_PAGO)}")
        return self


class FacturaEstadoCambio(BaseModel):
    estado: str


class ClienteMinOut(BaseModel):
    id: int
    nombre: str
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    model_config = {"from_attributes": True}


class VendedorMinOut(BaseModel):
    id: int
    name: str
    email: str
    model_config = {"from_attributes": True}


class NVRef(BaseModel):
    id: int
    numero: int
    model_config = {"from_attributes": True}


class CotizacionRef(BaseModel):
    id: int
    numero: int
    model_config = {"from_attributes": True}


class FacturaOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    nv_id: int | None = None
    cliente_id: int | None = None
    vendedor_id: int | None = None
    empresa_id: int | None = None
    banco_receptor_id: int | None = None
    contacto: str | None = None
    fecha: date
    fecha_vencimiento: date | None = None
    estado: str
    tipo_dte: str = "033"
    dte_estado: str = "no_emitida"
    nota: str | None = None
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    fecha_pago: date | None = None
    monto_pagado: Decimal | None = None
    metodo_pago: str | None = None
    plazo_dias: int = 0
    origen: str = "manual"
    exclude_recordatorio: bool = False
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    banco_receptor: BancoReceptorOut | None = None
    nv: NVRef | None = None
    cotizacion: CotizacionRef | None = None
    referencias_docs: list = Field(default_factory=list)
    lineas: list[FacturaLineaOut] = []
    is_locked: bool
    model_config = {"from_attributes": True}

    @field_validator("referencias_docs", mode="before")
    @classmethod
    def _coerce_referencias_docs(cls, v):
        return [] if v is None else v


class FacturaListOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    nv_id: int | None = None
    cliente_id: int | None = None
    vendedor_id: int | None = None
    empresa_id: int | None = None
    banco_receptor_id: int | None = None
    contacto: str | None = None
    fecha: date
    fecha_vencimiento: date | None = None
    estado: str
    dte_estado: str
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    fecha_pago: date | None = None
    monto_pagado: Decimal | None = None
    metodo_pago: str | None = None
    plazo_dias: int = 0
    exclude_recordatorio: bool = False
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    lineas: list[FacturaLineaOut] = []
    margen_total: Decimal | None = None
    is_locked: bool
    model_config = {"from_attributes": True}
