// frontend/src/types/dashboard.ts

export type WidgetType =
  | 'ventas_periodo'
  | 'cotizaciones_abiertas'
  | 'top_clientes'
  | 'top_productos'
  | 'stock_critico'
  | 'nv_por_cobrar'
  | 'cotizaciones_por_vendedor'
  | 'ventas_por_vendedor'

export type ChartType = 'kpi' | 'bar' | 'line' | 'table'

export type DateRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

export type Granularity = 'day' | 'week' | 'month' | 'year'

export interface WidgetGridPos {
  x: number
  y: number
  w: number
  h: number
}

export interface WidgetConfig {
  id: string
  type: WidgetType
  chart: ChartType
  date_range: DateRange
  date_from?: string
  date_to?: string
  limit: number
  goal?: number | null
  granularity?: Granularity
  grid: WidgetGridPos
}

export interface LayoutPayload {
  widgets: WidgetConfig[]
}

export interface DashboardLayoutOut {
  role: string
  layout: LayoutPayload
  updated_at?: string
}

export interface DashboardPreset {
  slot: number
  name: string
  layout: LayoutPayload
  updated_at?: string
}

// ── API response shapes ────────────────────────────────────────────────────

export interface VentasPeriodoSerie {
  periodo: string
  monto: number
}

export interface VentasPeriodoOut {
  total: number
  series: VentasPeriodoSerie[]
}

export interface EstadoCount {
  estado: string
  count: number
}

export interface CotizacionesAbiertasOut {
  total: number
  por_estado: EstadoCount[]
}

export interface TopClienteItem {
  cliente_id: number
  nombre: string
  total: number
}

export interface TopProductoItem {
  producto_id: number
  nombre: string
  sku: string | null
  cantidad: number
  total: number
}

export interface StockCriticoItem {
  producto_id: number
  nombre: string
  sku: string | null
  stock_actual: number
  stock_minimo: number
}

export interface FacturaPorCobrarItem {
  factura_id: number
  numero: number
  cliente: string
  total: number
  saldo: number
  fecha?: string | null
  fecha_vencimiento?: string | null
}

export interface FacturaPorCobrarOut {
  total_monto: number
  count: number
  items: FacturaPorCobrarItem[]
}

export interface VentasDetalleItem {
  nv_id: number
  numero: number
  cliente: string
  total: number
  fecha: string
  estado: string
}

export interface VentasDetalleOut {
  total_monto: number
  count: number
  items: VentasDetalleItem[]
}

export interface VendedorMetricaItem {
  vendedor_id: number
  nombre: string
  total: number
  count: number
}

export interface DashboardSummaryOut {
  ventas_hoy: number
  ventas_hoy_count: number
  ventas_ayer: number
  ventas_mes: number
  ventas_mes_count: number
  ventas_mes_anterior: number
  facturas_pendientes_count: number
  facturas_pendientes_monto: number
  cotizaciones_abiertas_count: number
  stock_critico_count: number
}
