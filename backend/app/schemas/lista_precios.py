from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class UsuarioRef(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class ListaPreciosOut(BaseModel):
    id: int
    nombre_archivo: str
    fecha_subida: datetime
    activa: bool
    total_items: int
    subida_por: UsuarioRef | None = None
    model_config = {"from_attributes": True}


class ListaPreciosItemOut(BaseModel):
    id: int
    sku: str
    costo_unitario: Decimal
    model_config = {"from_attributes": True}


class ListaPreciosItemsPage(BaseModel):
    items: list[ListaPreciosItemOut]
    total: int
    page: int
    page_size: int


class ListaPreciosUploadResult(BaseModel):
    lista_id: int
    total_filas: int
    filas_invalidas: int
    productos_actualizados: int
    skus_sin_producto: list[str]
    productos_no_incluidos_count: int


class HistorialCostoItem(BaseModel):
    fecha_subida: datetime
    costo_unitario: Decimal
    lista_id: int
    nombre_archivo: str
