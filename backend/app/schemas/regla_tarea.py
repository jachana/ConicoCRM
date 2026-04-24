from pydantic import BaseModel, Field
from typing import Literal


class ReglaTareaOut(BaseModel):
    id: int
    tipo: str
    activa: bool
    offset_dias: int
    asignado_rol: Literal["vendedor", "admin", "owner"]

    model_config = {"from_attributes": True}


class ReglaTareaPatch(BaseModel):
    activa: bool | None = None
    offset_dias: int | None = Field(default=None, ge=0, le=365)
    asignado_rol: Literal["vendedor", "admin", "owner"] | None = None
