from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class OrdenCompraLineaCreate(BaseModel):
    orden: int
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    cantidad: int = 1
    valor_neto: Decimal = Decimal("0")


class OrdenCompraLineaOut(BaseModel):
    id: int
    orden: int
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    cantidad: int
    cantidad_recibida: int
    valor_neto: Decimal
    total_neto: Decimal
    iva: Decimal
    total: Decimal
    model_config = {"from_attributes": True}


class OrdenCompraCreate(BaseModel):
    proveedor_id: int
    fecha: date | None = None
    fecha_entrega_esperada: date | None = None
    nota: str | None = None
    lineas: list[OrdenCompraLineaCreate] = []


class OrdenCompraUpdate(BaseModel):
    proveedor_id: int | None = None
    fecha: date | None = None
    fecha_entrega_esperada: date | None = None
    nota: str | None = None


class ProveedorMinOut(BaseModel):
    id: int
    nombre: str
    rut: str | None = None
    email: str | None = None
    contacto: str | None = None
    telefono: str | None = None
    model_config = {"from_attributes": True}


class OrdenCompraOut(BaseModel):
    id: int
    numero: int
    proveedor_id: int
    fecha: date
    fecha_entrega_esperada: date | None = None
    estado: str
    nota: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    proveedor: ProveedorMinOut | None = None
    lineas: list[OrdenCompraLineaOut] = []
    model_config = {"from_attributes": True}


class OrdenCompraListOut(BaseModel):
    id: int
    numero: int
    proveedor_id: int
    fecha: date
    fecha_entrega_esperada: date | None = None
    estado: str
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    proveedor: ProveedorMinOut | None = None
    model_config = {"from_attributes": True}


class RecepcionLineaItem(BaseModel):
    id: int
    cantidad_recibida: int


class RecepcionPayload(BaseModel):
    lineas: list[RecepcionLineaItem]


class EstadoUpdate(BaseModel):
    estado: str
