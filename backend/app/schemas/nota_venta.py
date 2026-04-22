from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel
from app.schemas.empresa import EmpresaRef


class NotaVentaLineaCreate(BaseModel):
    orden: int
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    formato: str | None = None
    cantidad: int = 1
    valor_neto: Decimal = Decimal("0")


class NotaVentaLineaOut(NotaVentaLineaCreate):
    id: int
    total_neto: Decimal
    iva: Decimal
    total: Decimal
    margen: Decimal | None = None
    model_config = {"from_attributes": True}


class NotaVentaCreate(BaseModel):
    cliente_id: int
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    lineas: list[NotaVentaLineaCreate] = []
    direccion_despacho: str | None = None
    retiro_en_conico: bool = False
    terminos_pago: str | None = None


class NotaVentaUpdate(BaseModel):
    cliente_id: int | None = None
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    direccion_despacho: str | None = None
    retiro_en_conico: bool | None = None
    terminos_pago: str | None = None


class EstadoCambio(BaseModel):
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


class CotizacionRef(BaseModel):
    id: int
    numero: int
    model_config = {"from_attributes": True}


class NotaVentaOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    factura_id: int | None = None
    cliente_id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    contacto: str | None = None
    fecha: date
    estado: str
    nota: str | None = None
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    cotizacion: CotizacionRef | None = None
    lineas: list[NotaVentaLineaOut] = []
    direccion_despacho: str | None = None
    retiro_en_conico: bool = False
    terminos_pago: str | None = None
    model_config = {"from_attributes": True}


class NotaVentaListOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    factura_id: int | None = None
    cliente_id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    contacto: str | None = None
    fecha: date
    estado: str
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    direccion_despacho: str | None = None
    retiro_en_conico: bool = False
    terminos_pago: str | None = None
    model_config = {"from_attributes": True}
