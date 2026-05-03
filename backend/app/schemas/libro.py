from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class LibroVentasCreate(BaseModel):
    """Input schema for creating sales book (Libro de Ventas)"""
    periodo: str = Field(..., description="Period in YYYY-MM format")
    empresa_id: int
    folio_inicio: int | None = None
    folio_fin: int | None = None


class LibroVentasRead(BaseModel):
    """Output schema for sales book"""
    id: int
    periodo: str
    empresa_id: int
    folio_inicio: int | None
    folio_fin: int | None
    total_registros: int
    monto_total: int
    estado: Literal["borrador", "enviado"]
    created_at: datetime

    model_config = {"from_attributes": True}


class LibroComprasCreate(BaseModel):
    """Input schema for creating purchase book (Libro de Compras)"""
    periodo: str = Field(..., description="Period in YYYY-MM format")
    empresa_id: int
    rut_proveedor: str | None = None


class LibroComprasRead(BaseModel):
    """Output schema for purchase book"""
    id: int
    periodo: str
    empresa_id: int
    rut_proveedor: str | None
    total_registros: int
    monto_total: int
    estado: Literal["borrador", "enviado"]
    created_at: datetime

    model_config = {"from_attributes": True}


class LibroGenerarRequest(BaseModel):
    """Input schema for generating a libro for a given period"""
    periodo: str = Field(..., description="Period in YYYY-MM format")


class LibroEnviarResponse(BaseModel):
    """Response after submitting a libro to Lioren/SII"""
    id: int
    periodo: str
    estado: str
    lioren_response: dict | None = None


class DteRecepcionCreate(BaseModel):
    """Input schema for creating DTE reception record"""
    tipo: str = Field(..., description="DTE type code, e.g. '46' for Libro de Recepción")
    folio: int
    rut_emisor: str
    monto: int
    xml_raw: str | None = None
    empresa_id: int


class DteRecepcionRead(BaseModel):
    """Output schema for DTE reception"""
    id: int
    empresa_id: int
    tipo: str
    folio: int
    rut_emisor: str
    monto: int
    xml_raw: str | None
    estado: Literal["recibido", "aceptado", "rechazado"]
    respuesta_sii: dict | None
    rechazo_motivo: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
