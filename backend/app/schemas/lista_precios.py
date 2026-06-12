from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel

from app.schemas.user import UsuarioMinOut


class ListaPreciosOut(BaseModel):
    id: int
    nombre_archivo: str
    fecha_subida: datetime
    activa: bool
    total_items: int
    subida_por: UsuarioMinOut | None = None
    model_config = {"from_attributes": True}


class ListaPreciosPage(BaseModel):
    items: list[ListaPreciosOut]
    total: int
    page: int
    page_size: int


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


class HistorialVentaItem(BaseModel):
    fecha: date
    doc_tipo: str  # 'NV' | 'Factura' | 'Boleta'
    doc_id: int
    doc_numero: int | None
    cliente_id: int | None
    cliente_nombre: str | None
    empresa_id: int | None
    empresa_nombre: str | None
    cantidad: Decimal
    precio_unitario: Decimal
    total: Decimal


class HistorialVentaPage(BaseModel):
    items: list[HistorialVentaItem]
    total: int
    total_cantidad: Decimal
    total_monto: Decimal


class HistorialCompraItem(BaseModel):
    fecha: date
    oc_id: int
    oc_numero: int
    proveedor_id: int
    proveedor_nombre: str
    estado: str
    cantidad: int
    cantidad_recibida: int
    precio_unitario: Decimal
    total: Decimal


class HistorialCompraPage(BaseModel):
    items: list[HistorialCompraItem]
    total: int
    total_cantidad: int
    total_monto: Decimal
