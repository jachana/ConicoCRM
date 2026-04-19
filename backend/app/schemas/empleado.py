from datetime import datetime, date
from pydantic import BaseModel


class EmpleadoCreate(BaseModel):
    nombre: str
    cargo: str
    sueldo_base: float | None = None
    fecha_ingreso: date | None = None
    is_active: bool = True


class EmpleadoUpdate(BaseModel):
    nombre: str | None = None
    cargo: str | None = None
    sueldo_base: float | None = None
    fecha_ingreso: date | None = None
    is_active: bool | None = None


class EmpleadoOut(BaseModel):
    id: int
    nombre: str
    cargo: str
    sueldo_base: float | None
    fecha_ingreso: date | None
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}
