from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel
from app.schemas.empresa import EmpresaRef


class CotizacionLineaCreate(BaseModel):
    orden: int
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    formato: str | None = None
    cantidad: int = 1
    valor_neto: Decimal = Decimal("0")


class CotizacionLineaOut(CotizacionLineaCreate):
    id: int
    total_neto: Decimal
    iva: Decimal
    total: Decimal
    margen: Decimal | None = None
    model_config = {"from_attributes": True}


class CotizacionCreate(BaseModel):
    cliente_id: int
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    estado: str = "no_definido"
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    terminos_pago: str | None = None
    lineas: list[CotizacionLineaCreate] = []


class CotizacionUpdate(BaseModel):
    cliente_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    estado: str | None = None
    nota: str | None = None
    correo: str | None = None
    vendedor_id: int | None = None
    empresa_id: int | None = None
    terminos_pago: str | None = None
    terminos_pago_estado: str | None = None


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


class CotizacionOut(BaseModel):
    id: int
    numero: int
    cliente_id: int
    vendedor_id: int
    contacto: str | None = None
    fecha: date
    estado: str
    nota: str | None = None
    terminos_pago: str | None = None
    terminos_pago_estado: str = "aprobado"
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    lineas: list[CotizacionLineaOut] = []
    model_config = {"from_attributes": True}


class CotizacionListOut(BaseModel):
    id: int
    numero: int
    cliente_id: int
    vendedor_id: int
    contacto: str | None = None
    fecha: date
    estado: str
    correo: str | None = None
    terminos_pago: str | None = None
    terminos_pago_estado: str = "aprobado"
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    margen_total: Decimal | None = None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    model_config = {"from_attributes": True}


class SystemConfigOut(BaseModel):
    key: str
    value: str
    model_config = {"from_attributes": True}


class SystemConfigUpdate(BaseModel):
    updates: dict[str, str]
