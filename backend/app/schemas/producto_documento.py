from datetime import datetime
from pydantic import BaseModel


class ProductoDocumentoOut(BaseModel):
    id: int
    producto_id: int
    nombre: str
    subido_en: datetime
    model_config = {"from_attributes": True}
