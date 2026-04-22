from pydantic import BaseModel


class BancoReceptorOut(BaseModel):
    id: int
    nombre: str
    activo: bool
    model_config = {"from_attributes": True}


class BancoReceptorCreate(BaseModel):
    nombre: str


class BancoReceptorPatch(BaseModel):
    nombre: str | None = None
    activo: bool | None = None
