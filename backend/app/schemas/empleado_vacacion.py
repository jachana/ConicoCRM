from datetime import datetime, date
from pydantic import BaseModel


class EmpleadoVacacionCreate(BaseModel):
    fecha_inicio: date
    fecha_fin: date
    dias: int
    descripcion: str | None = None


class EmpleadoVacacionUpdate(BaseModel):
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    dias: int | None = None
    descripcion: str | None = None


class EmpleadoVacacionOut(BaseModel):
    id: int
    empleado_id: int
    fecha_inicio: date
    fecha_fin: date
    dias: int
    descripcion: str | None
    registrado_en: datetime
    model_config = {"from_attributes": True}
