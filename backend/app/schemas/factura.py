from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator
from app.schemas.empresa import EmpresaRef


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
    lineas: list[FacturaLineaCreate] = []


_METODOS_PAGO_ALLOWED = {"efectivo", "transferencia", "cheque", "debito", "credito", "deposito"}


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

    @field_validator("metodo_pago")
    @classmethod
    def validar_metodo_pago(cls, v: str | None) -> str | None:
        if v is not None and v not in _METODOS_PAGO_ALLOWED:
            raise ValueError(f"metodo_pago debe ser uno de: {sorted(_METODOS_PAGO_ALLOWED)}")
        return v


class FacturaEstadoCambio(BaseModel):
    estado: str
    fecha_pago: date | None = None
    monto_pagado: Decimal | None = None
    metodo_pago: str | None = None


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
    nota: str | None = None
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    fecha_pago: date | None = None
    monto_pagado: Decimal | None = None
    metodo_pago: str | None = None
    origen: str = "manual"
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    nv: NVRef | None = None
    cotizacion: CotizacionRef | None = None
    lineas: list[FacturaLineaOut] = []
    is_locked: bool = True
    model_config = {"from_attributes": True}


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
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    fecha_pago: date | None = None
    monto_pagado: Decimal | None = None
    metodo_pago: str | None = None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    lineas: list[FacturaLineaOut] = []
    margen_total: Decimal | None = None
    is_locked: bool = True
    model_config = {"from_attributes": True}
