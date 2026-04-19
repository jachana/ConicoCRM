# backend/app/schemas/dashboard_layout.py
from datetime import datetime
from pydantic import BaseModel


class WidgetGridPos(BaseModel):
    x: int
    y: int
    w: int
    h: int


class WidgetConfig(BaseModel):
    id: str
    type: str
    chart: str
    date_range: str = "month"
    date_from: str | None = None
    date_to: str | None = None
    limit: int = 10


class LayoutPayload(BaseModel):
    widgets: list[WidgetConfig]


class DashboardLayoutOut(BaseModel):
    role: str
    layout: LayoutPayload
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Analytics response schemas ---

class VentasPeriodoSerie(BaseModel):
    periodo: str
    monto: float


class VentasPeriodoOut(BaseModel):
    total: float
    series: list[VentasPeriodoSerie]


class EstadoCount(BaseModel):
    estado: str
    count: int


class CotizacionesAbiertasOut(BaseModel):
    total: int
    por_estado: list[EstadoCount]


class TopClienteItem(BaseModel):
    cliente_id: int
    nombre: str
    total: float


class TopProductoItem(BaseModel):
    producto_id: int
    nombre: str
    sku: str | None
    cantidad: int
    total: float


class StockCriticoItem(BaseModel):
    producto_id: int
    nombre: str
    sku: str | None
    stock_actual: int
    stock_minimo: int


class NVPorCobrarItem(BaseModel):
    numero: int
    cliente: str
    total: float


class NVPorCobrarOut(BaseModel):
    total_monto: float
    count: int
    items: list[NVPorCobrarItem]


class VendedorMetricaItem(BaseModel):
    vendedor_id: int
    nombre: str
    total: float
    count: int
