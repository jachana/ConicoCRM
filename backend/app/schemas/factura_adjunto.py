from datetime import datetime
from pydantic import BaseModel


class FacturaAdjuntoOut(BaseModel):
    id: int
    factura_id: int
    nombre: str
    ruta: str
    mime_type: str
    subido_en: datetime
    subido_por_id: int | None
    model_config = {"from_attributes": True}
