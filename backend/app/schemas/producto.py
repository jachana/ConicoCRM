from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator


class MarcaRef(BaseModel):
    id: int
    nombre: str
    model_config = {"from_attributes": True}


class ProductoBase(BaseModel):
    nombre: str
    descripcion: str | None = None
    precio_venta: Decimal = Decimal("0")
    stock_minimo: int = 0
    stock_actual: int = 0
    proveedor_id: int | None = None
    marca_id: int | None = None
    volumen: Decimal | None = None
    tags: list[str] = []

    @field_validator("tags", mode="before")
    @classmethod
    def extract_tags(cls, v):
        if not v:
            return []
        if v and hasattr(v[0], "nombre"):
            return [t.nombre for t in v]
        return list(v)


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    precio_venta: Decimal | None = None
    stock_minimo: int | None = None
    stock_actual: int | None = None
    proveedor_id: int | None = None
    marca_id: int | None = None
    volumen: Decimal | None = None
    tags: list[str] | None = None


class ProductoOut(ProductoBase):
    id: int
    sku: str | None = None
    formato: str | None = None
    precio_costo: Decimal = Decimal("0")
    ultimo_costo_unitario: Decimal = Decimal("0")
    precio_con_iva: Decimal = Decimal("0")
    costo_con_iva: Decimal = Decimal("0")
    marca: MarcaRef | None = None
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
    marca_id: int | None = None
    tags: list[str] = []
    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def extract_tags(cls, v):
        if not v:
            return []
        if v and hasattr(v[0], "nombre"):
            return [t.nombre for t in v]
        return list(v)
