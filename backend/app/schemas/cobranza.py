from __future__ import annotations
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field


class CobranzaConfigOut(BaseModel):
    id: int
    empresa_id: int
    dias_frecuencia: int
    model_config = {"from_attributes": True}


class CobranzaConfigUpdate(BaseModel):
    dias_frecuencia: int = Field(..., ge=1)


class AgingBucket(BaseModel):
    count: int
    monto: Decimal


class AgingReport(BaseModel):
    d_0_30: AgingBucket
    d_31_60: AgingBucket
    d_61_90: AgingBucket
    d_90_plus: AgingBucket


class EmpresaDesglose(BaseModel):
    empresa_id: int
    empresa_nombre: str
    total: Decimal
    vencido: Decimal


class CobranzaDashboardOut(BaseModel):
    total_por_cobrar: Decimal
    total_vencido: Decimal
    proximas_a_vencer: Decimal
    aging: AgingReport
    por_empresa: list[EmpresaDesglose]


class RecordatorioItemOut(BaseModel):
    id: int
    numero: int
    empresa_id: int | None
    empresa_nombre: str | None
    cliente_nombre: str | None
    total: Decimal
    monto_pagado: Decimal
    saldo: Decimal
    fecha_vencimiento: date | None
    dias_vencida: int
    ultimo_recordatorio: date | None
    correo_enviar: str | None


class RecordatorioCreate(BaseModel):
    to: str
    subject: str
    body: str


class EmpresaData(BaseModel):
    rut: str
    nombre: str
    email: str


class ImportXMLError(BaseModel):
    filename: str
    message: str
    empresa_data: EmpresaData | None = None


class ImportXMLResult(BaseModel):
    creadas: int
    actualizadas: int
    errores: list[ImportXMLError]
