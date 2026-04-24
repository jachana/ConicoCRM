from datetime import datetime
from pydantic import BaseModel, field_validator

from app.schemas.user import UsuarioMinOut

MOTIVOS_VALIDOS = {"conteo_fisico", "merma", "correccion", "otro"}


class AjusteCreate(BaseModel):
    producto_id: int
    cantidad: int
    signo: int  # +1 o -1
    motivo: str
    nota: str | None = None

    @field_validator("cantidad")
    @classmethod
    def cantidad_positiva(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("cantidad debe ser > 0")
        return v

    @field_validator("signo")
    @classmethod
    def signo_valido(cls, v: int) -> int:
        if v not in (1, -1):
            raise ValueError("signo debe ser 1 o -1")
        return v

    @field_validator("motivo")
    @classmethod
    def motivo_valido(cls, v: str) -> str:
        if v not in MOTIVOS_VALIDOS:
            raise ValueError(f"motivo debe ser uno de: {', '.join(MOTIVOS_VALIDOS)}")
        return v


class ProductoMinOut(BaseModel):
    id: int
    nombre: str
    sku: str | None = None
    model_config = {"from_attributes": True}


class MovimientoOut(BaseModel):
    id: int
    producto_id: int
    tipo: str
    cantidad: int
    signo: int
    referencia_tipo: str | None = None
    referencia_id: int | None = None
    motivo: str | None = None
    nota: str | None = None
    usuario_id: int | None = None
    created_at: datetime
    producto: ProductoMinOut | None = None
    usuario: UsuarioMinOut | None = None
    model_config = {"from_attributes": True}


class MovimientoListOut(BaseModel):
    items: list[MovimientoOut]
    total: int
    page: int
    page_size: int


class StockBajoItem(BaseModel):
    id: int
    nombre: str
    sku: str | None = None
    stock_actual: int
    stock_minimo: int
    model_config = {"from_attributes": True}
