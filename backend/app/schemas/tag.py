from pydantic import BaseModel


class TagOut(BaseModel):
    id: int
    nombre: str
    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    nombre: str
