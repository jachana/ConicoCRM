from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel


class FacturaCompraLineaCreate(BaseModel):
    orden: int | None = None
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    cantidad: int = 1
    valor_neto: Decimal = Decimal("0")


class FacturaCompraLineaOut(BaseModel):
    id: int
    orden: int
    producto_id: int | None
    sku: str | None
    descripcion: str
    cantidad: int
    valor_neto: Decimal
    total_neto: Decimal
    iva: Decimal
    total: Decimal
    model_config = {"from_attributes": True}


class FacturaCompraCreate(BaseModel):
    proveedor_id: int | None = None
    fecha: date | None = None
    nota: str | None = None
    lineas: list[FacturaCompraLineaCreate] = []


class FacturaCompraUpdate(BaseModel):
    proveedor_id: int | None = None
    fecha: date | None = None
    nota: str | None = None
    lineas: list[FacturaCompraLineaCreate] | None = None


class FacturaCompraOut(BaseModel):
    id: int
    numero: int
    proveedor_id: int | None
    fecha: date
    estado: str
    nota: str | None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    dte_estado: str
    created_at: datetime
    lineas: list[FacturaCompraLineaOut] = []
    model_config = {"from_attributes": True}


class FacturaCompraListOut(BaseModel):
    id: int
    numero: int
    proveedor_id: int | None
    fecha: date
    estado: str
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    dte_estado: str
    model_config = {"from_attributes": True}
