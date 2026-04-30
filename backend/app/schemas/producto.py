from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator


class MarcaRef(BaseModel):
    id: int
    nombre: str
    model_config = {"from_attributes": True}


class TipoRef(BaseModel):
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
    tipos: list[int] = []


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
    tipos: list[int] | None = None


class ProductoOutPublic(ProductoBase):
    id: int
    sku: str | None = None
    formato: str | None = None
    precio_con_iva: Decimal = Decimal("0")
    marca: MarcaRef | None = None
    tipos: list[TipoRef] = []
    created_at: datetime
    model_config = {"from_attributes": True}


class ProductoOutAdmin(ProductoOutPublic):
    precio_costo: Decimal = Decimal("0")
    costo_con_iva: Decimal = Decimal("0")
    precio_costo_actualizado_en: datetime | None = None
    costo_desactualizado: bool = False


class ProductoBusquedaOutPublic(BaseModel):
    id: int
    nombre: str
    descripcion: str | None = None
    sku: str | None = None
    formato: str | None = None
    precio_venta: Decimal
    stock_actual: int
    marca_id: int | None = None
    tags: list[str] = []
    tipos: list[TipoRef] = []
    model_config = {"from_attributes": True}

    @field_validator("tags", mode="before")
    @classmethod
    def extract_tags(cls, v):
        if not v:
            return []
        if v and hasattr(v[0], "nombre"):
            return [t.nombre for t in v]
        return list(v)


class ProductoBusquedaOutAdmin(ProductoBusquedaOutPublic):
    precio_costo: Decimal


class BulkPrecioItem(BaseModel):
    id: int
    precio_venta: Decimal

    @field_validator("precio_venta")
    @classmethod
    def precio_positivo(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("precio_venta debe ser mayor a 0")
        return v


class BulkPreciosRequest(BaseModel):
    items: list[BulkPrecioItem]

    @field_validator("items")
    @classmethod
    def no_vacio(cls, v: list[BulkPrecioItem]) -> list[BulkPrecioItem]:
        if not v:
            raise ValueError("items no puede estar vacío")
        ids = [it.id for it in v]
        if len(ids) != len(set(ids)):
            raise ValueError("items contiene IDs duplicados")
        return v


class BulkPreciosResponse(BaseModel):
    actualizados: int
    ids: list[int]
