import json
from datetime import datetime
from pydantic import BaseModel, field_validator


class LineaPropuestaItem(BaseModel):
    linea_id: int
    descripcion: str
    valor_neto_actual: float
    margen_actual: float | None
    valor_neto_propuesto: float
    margen_propuesto: float


class AprobacionMargenCreate(BaseModel):
    cotizacion_id: int
    nota: str | None = None
    lineas_propuestas: list[LineaPropuestaItem]


class AprobacionMargenAccion(BaseModel):
    accion: str  # "aprobar" | "denegar"


class VendedorMinOut(BaseModel):
    id: int
    name: str
    email: str
    model_config = {"from_attributes": True}


class AprobacionMargenOut(BaseModel):
    id: int
    cotizacion_id: int | None = None
    vendedor_id: int | None = None
    nota: str | None = None
    estado: str
    lineas_propuestas: list[LineaPropuestaItem]
    created_at: datetime
    vendedor: VendedorMinOut | None = None
    model_config = {"from_attributes": True}

    @field_validator("lineas_propuestas", mode="before")
    @classmethod
    def parse_lineas(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v
