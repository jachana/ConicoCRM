import json
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator

from app.schemas.aprobacion import VendedorMinOut


class LineaDescuentoPropuesta(BaseModel):
    linea_id: int
    descripcion: str
    descuento_actual: float
    descuento_propuesto: float


class SolicitudDescuentoCreate(BaseModel):
    cotizacion_id: int
    nota: str | None = None
    lineas_propuestas: list[LineaDescuentoPropuesta]


class SolicitudDescuentoAccion(BaseModel):
    accion: str  # "aprobar" | "rechazar" | "revocar"
    comentario: str | None = None


class SolicitudDescuentoOut(BaseModel):
    id: int
    cotizacion_id: int | None = None
    vendedor_id: int | None = None
    revisor_id: int | None = None
    nota: str | None = None
    comentario_revisor: str | None = None
    estado: str
    lineas_propuestas: list[LineaDescuentoPropuesta]
    created_at: datetime
    updated_at: datetime
    vendedor: VendedorMinOut | None = None
    revisor: VendedorMinOut | None = None
    model_config = {"from_attributes": True}

    @field_validator("lineas_propuestas", mode="before")
    @classmethod
    def parse_lineas(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v


class DescuentoStatusOut(BaseModel):
    blocked: bool
    estado: str | None
    solicitud_id: int | None
    umbral_libre_pct: float
