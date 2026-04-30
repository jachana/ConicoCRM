from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class EtapaBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=100)
    orden: int = 0
    color: str = "#6366f1"
    is_terminal_won: bool = False
    is_terminal_lost: bool = False
    is_active: bool = True


class EtapaCreate(EtapaBase):
    pass


class EtapaUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=100)
    orden: int | None = None
    color: str | None = None
    is_terminal_won: bool | None = None
    is_terminal_lost: bool | None = None
    is_active: bool | None = None


class EtapaOut(EtapaBase):
    id: int
    model_config = {"from_attributes": True}


class _Ref(BaseModel):
    id: int
    nombre: str | None = None
    name: str | None = None
    model_config = {"from_attributes": True}


class OportunidadCreate(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=255)
    cliente_id: int | None = None
    empresa_id: int | None = None
    vendedor_id: int | None = None
    etapa_id: int | None = None
    monto_estimado: Decimal = Decimal("0")
    probabilidad: int = Field(0, ge=0, le=100)
    fecha_cierre_estimada: date | None = None
    descripcion: str | None = None


class OportunidadUpdate(BaseModel):
    titulo: str | None = Field(None, min_length=1, max_length=255)
    cliente_id: int | None = None
    empresa_id: int | None = None
    vendedor_id: int | None = None
    etapa_id: int | None = None
    monto_estimado: Decimal | None = None
    probabilidad: int | None = Field(None, ge=0, le=100)
    fecha_cierre_estimada: date | None = None
    descripcion: str | None = None
    motivo_perdida: str | None = None


class MoveStageIn(BaseModel):
    etapa_id: int
    motivo_perdida: str | None = None


class OportunidadOut(BaseModel):
    id: int
    titulo: str
    cliente_id: int | None
    cliente_nombre: str | None = None
    empresa_id: int | None
    empresa_nombre: str | None = None
    vendedor_id: int | None
    vendedor_nombre: str | None = None
    etapa_id: int
    etapa_nombre: str | None = None
    etapa_color: str | None = None
    is_terminal_won: bool = False
    is_terminal_lost: bool = False
    monto_estimado: Decimal
    probabilidad: int
    fecha_cierre_estimada: date | None
    descripcion: str | None
    cotizacion_id: int | None
    cotizacion_numero: int | None = None
    won_at: datetime | None
    lost_at: datetime | None
    motivo_perdida: str | None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class PipelineEtapaSummary(BaseModel):
    etapa: EtapaOut
    oportunidades: list[OportunidadOut]
    total_monto: Decimal
    count: int


class PipelineOut(BaseModel):
    etapas: list[PipelineEtapaSummary]


class ReporteConversionOut(BaseModel):
    total: int
    ganadas: int
    perdidas: int
    abiertas: int
    monto_ganado: Decimal
    monto_perdido: Decimal
    monto_pipeline: Decimal
    tasa_conversion: float


class ConvertToCotizacionOut(BaseModel):
    cotizacion_id: int
    cotizacion_numero: int
