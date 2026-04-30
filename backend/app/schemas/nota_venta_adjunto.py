from datetime import datetime
from pydantic import BaseModel


class NotaVentaAdjuntoOut(BaseModel):
    id: int
    nv_id: int
    nombre: str
    ruta: str
    mime_type: str
    subido_en: datetime
    subido_por_id: int | None
    model_config = {"from_attributes": True}
