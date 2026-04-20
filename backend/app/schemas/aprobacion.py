from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, model_validator


class VendedorMinOut(BaseModel):
    id: int
    name: str
    email: str
    model_config = {"from_attributes": True}


class EmpresaMinOut(BaseModel):
    id: int
    nombre: str
    model_config = {"from_attributes": True}


class AprobacionCreate(BaseModel):
    empresa_id: int
    total: Decimal
    nota: str | None = None
    origen: str  # "cotizacion" | "directa"
    cotizacion_id: int | None = None
    nv_payload: dict | None = None

    @model_validator(mode='after')
    def check_origen_fields(self):
        if self.origen == 'cotizacion' and not self.cotizacion_id:
            raise ValueError('cotizacion_id requerido para origen cotizacion')
        if self.origen == 'directa' and not self.nv_payload:
            raise ValueError('nv_payload requerido para origen directa')
        return self


class AprobacionAccion(BaseModel):
    accion: str  # "aprobar" | "denegar"


class AprobacionOut(BaseModel):
    id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    total: Decimal
    nota: str | None = None
    estado: str
    origen: str
    cotizacion_id: int | None = None
    nv_id: int | None = None
    created_at: datetime
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaMinOut | None = None
    model_config = {"from_attributes": True}
