from datetime import date, datetime
from pydantic import BaseModel, Field, model_validator
from typing import Literal, Optional


ENTIDAD_FKS = ["cliente_id", "empresa_id", "cotizacion_id", "nota_venta_id", "factura_id", "producto_id"]


class TareaIn(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    descripcion: str | None = None
    due_date: date
    asignado_id: int
    cliente_id: int | None = None
    empresa_id: int | None = None
    cotizacion_id: int | None = None
    nota_venta_id: int | None = None
    factura_id: int | None = None
    producto_id: int | None = None

    @model_validator(mode="after")
    def max_una_fk(self):
        fks = [getattr(self, f) for f in ENTIDAD_FKS]
        if sum(1 for v in fks if v is not None) > 1:
            raise ValueError("Solo se puede vincular a UNA entidad")
        return self


class TareaPatch(BaseModel):
    titulo: str | None = Field(default=None, min_length=1, max_length=255)
    descripcion: str | None = None
    due_date: date | None = None
    asignado_id: int | None = None


class TareaOut(BaseModel):
    id: int
    titulo: str
    descripcion: str | None
    due_date: date
    estado: Literal["pendiente", "hecha", "descartada"]
    motivo_descarte: str | None
    origen: Literal["manual", "auto"]
    tipo_regla: str | None
    prioridad_derivada: Literal["vencida", "hoy", "futura"]
    asignado_id: int
    asignado_nombre: str
    creado_por_id: int | None
    cliente_id: int | None
    empresa_id: int | None
    cotizacion_id: int | None
    nota_venta_id: int | None
    factura_id: int | None
    producto_id: int | None
    completada_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DescartarIn(BaseModel):
    motivo: str = Field(min_length=1, max_length=255)


class ReasignarIn(BaseModel):
    asignado_id: int


class MisPendientesOut(BaseModel):
    vencidas: int
    hoy: int
    futuras: int
    total: int
    tareas: list[TareaOut]
