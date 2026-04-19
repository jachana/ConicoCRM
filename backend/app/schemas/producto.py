from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class ProductoBase(BaseModel):
    nombre: str
    descripcion: str | None = None
    precio_costo: Decimal = Decimal("0")
    precio_venta: Decimal = Decimal("0")
    stock_minimo: int = 0
    stock_actual: int = 0
    proveedor_id: int | None = None


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    precio_costo: Decimal | None = None
    precio_venta: Decimal | None = None
    stock_minimo: int | None = None
    stock_actual: int | None = None
    proveedor_id: int | None = None


class ProductoOut(ProductoBase):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}


class ProductoBusquedaOut(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None
    sku: str | None = None
    formato: str | None = None
    precio_venta: Decimal
    precio_costo: Decimal
    stock_actual: int
    model_config = {"from_attributes": True}
