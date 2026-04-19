from datetime import datetime
from pydantic import BaseModel


class EmpleadoDocumentoOut(BaseModel):
    id: int
    empleado_id: int
    nombre: str
    tipo: str
    subido_en: datetime
    subido_por_id: int | None
    model_config = {"from_attributes": True}
