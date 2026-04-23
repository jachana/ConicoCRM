from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class LoteCostoOut(BaseModel):
    id: int
    producto_id: int
    oc_linea_id: int | None
    costo_unitario: Decimal
    cantidad_inicial: int
    cantidad_restante: int
    created_at: datetime
    model_config = {"from_attributes": True}
