from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class EmpresaBase(BaseModel):
    nombre: str
    razon_social: str | None = None
    rut: str
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


class FacturaResumen(BaseModel):
    id: int
    numero: int
    fecha: date
    contacto: str | None = None
    total: Decimal
    monto_pagado: Decimal
    estado: str
    model_config = {"from_attributes": True}


class EmpresaDeudaOut(BaseModel):
    total_facturado: Decimal
    total_pagado: Decimal
    deuda: Decimal
    facturas: list[FacturaResumen]


class EmpresaCreditoOut(BaseModel):
    limite_credito: Decimal | None
    credito_usado: Decimal | None
    credito_disponible: Decimal | None


class EmpresaDeudaBulkItem(BaseModel):
    empresa_id: int
    nombre: str
    plazo_credito: str | None
    limite_credito: Decimal | None
    deuda_total: Decimal
    deuda_vencida: Decimal


class EmpresaListItem(EmpresaOut):
    ultima_compra: date | None = None


class EmpresaFacturaDetailItem(BaseModel):
    id: int
    numero: int
    fecha: date
    estado: str
    contacto: str | None = None
    total: Decimal
    monto_pagado: Decimal
    pendiente: Decimal
    model_config = {"from_attributes": True}


class EmpresaProductoLineOut(BaseModel):
    fecha: date
    factura_id: int
    factura_numero: int
    sku: str | None
    descripcion: str
    cantidad: Decimal
    precio_unit: Decimal
    total_neto: Decimal
