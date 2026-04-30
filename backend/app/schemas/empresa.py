from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, computed_field


class ContactoEmpresaCreate(BaseModel):
    nombre: str
    cargo: str | None = None
    email: str | None = None
    telefono: str | None = None


class ContactoEmpresaUpdate(BaseModel):
    nombre: str | None = None
    cargo: str | None = None
    email: str | None = None
    telefono: str | None = None


class ContactoEmpresaOut(BaseModel):
    id: int
    empresa_id: int
    nombre: str
    cargo: str | None = None
    email: str | None = None
    telefono: str | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


class EmpresaBase(BaseModel):
    nombre: str
    razon_social: str | None = None
    rut: str | None = None
    rut_no_oficial: bool = False
    linea_credito: Decimal | None = None
    plazo_credito: str | None = None
    sector: str | None = None
    email: str | None = None
    nota_cobranza: str | None = None
    ubicacion: str | None = None
    ruts_adicionales: list[str] = []


class EmpresaCreate(EmpresaBase):
    pass


class EmpresaUpdate(BaseModel):
    nombre: str | None = None
    razon_social: str | None = None
    rut: str | None = None
    rut_no_oficial: bool | None = None
    linea_credito: Decimal | None = None
    plazo_credito: str | None = None
    sector: str | None = None
    email: str | None = None
    nota_cobranza: str | None = None
    ubicacion: str | None = None
    ruts_adicionales: list[str] | None = None


class EmpresaRef(BaseModel):
    id: int
    nombre: str
    razon_social: str | None = None
    rut: str | None = None
    model_config = {"from_attributes": True}


class EmpresaOut(EmpresaBase):
    id: int
    created_at: datetime
    logo_path: str | None = Field(default=None, exclude=True)
    model_config = {"from_attributes": True}

    @computed_field
    @property
    def has_logo(self) -> bool:
        return self.logo_path is not None


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
    linea_credito: Decimal | None
    credito_usado: Decimal | None
    credito_disponible: Decimal | None


class EmpresaDeudaBulkItem(BaseModel):
    empresa_id: int
    nombre: str
    plazo_credito: str | None
    linea_credito: Decimal | None
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
    model_config = {"from_attributes": True}
    fecha: date
    factura_id: int
    factura_numero: int
    sku: str | None = None
    descripcion: str
    cantidad: Decimal
    precio_unit: Decimal
    total_neto: Decimal
