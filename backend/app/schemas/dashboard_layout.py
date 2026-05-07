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
    goal: float | None = None
    grid: WidgetGridPos


class LayoutPayload(BaseModel):
    widgets: list[WidgetConfig]


class PresetOut(BaseModel):
    slot: int
    name: str
    layout: LayoutPayload
    updated_at: datetime | None = None


class PresetPayload(BaseModel):
    name: str
    layout: LayoutPayload


class CreatePresetPayload(BaseModel):
    name: str


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


class FacturaPorCobrarItem(BaseModel):
    factura_id: int
    numero: int
    cliente: str
    total: float
    saldo: float
    fecha: str | None = None
    fecha_vencimiento: str | None = None


class FacturaPorCobrarOut(BaseModel):
    total_monto: float
    count: int
    items: list[FacturaPorCobrarItem]


class VentasDetalleItem(BaseModel):
    nv_id: int
    numero: int
    cliente: str
    total: float
    fecha: str
    estado: str


class VentasDetalleOut(BaseModel):
    total_monto: float
    count: int
    items: list[VentasDetalleItem]


class VendedorMetricaItem(BaseModel):
    vendedor_id: int
    nombre: str
    total: float
    count: int


class DashboardSummaryOut(BaseModel):
    ventas_hoy: float
    ventas_hoy_count: int
    ventas_ayer: float
    ventas_mes: float
    ventas_mes_count: int
    ventas_mes_anterior: float
    facturas_pendientes_count: int
    facturas_pendientes_monto: float
    cotizaciones_abiertas_count: int
    stock_critico_count: int
