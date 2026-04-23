from datetime import datetime
from pydantic import BaseModel


class ProductoDocumentoOut(BaseModel):
    id: int
    producto_id: int
    nombre: str
    ruta: str
    subido_en: datetime
    subido_por_id: int | None
    model_config = {"from_attributes": True}
