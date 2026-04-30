from pydantic import BaseModel


class TipoProductoOut(BaseModel):
    id: int
    nombre: str
    model_config = {"from_attributes": True}


class TipoProductoCreate(BaseModel):
    nombre: str
