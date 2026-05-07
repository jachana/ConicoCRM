// frontend/src/components/dashboard/widgetCatalog.ts
import type { ChartType, WidgetConfig, WidgetType } from '../../types/dashboard'
import type { Modulo } from '../../lib/modulos'

export interface WidgetDef {
  type: WidgetType
  label: string
  chartTypes: ChartType[]
  hasDateRange: boolean
  adminOnly: boolean
  modulo?: Modulo
  defaultGrid: Partial<Record<ChartType, { w: number; h: number }>> & { default: { w: number; h: number } }
}

export const WIDGET_CATALOG: WidgetDef[] = [
  {
    type: 'ventas_periodo',
    label: 'Ventas del período',
    chartTypes: ['kpi', 'bar', 'line'],
    hasDateRange: true,
    adminOnly: false,
    modulo: 'facturas',
    defaultGrid: {
      kpi: { w: 3, h: 3 },
      bar: { w: 6, h: 4 },
      line: { w: 6, h: 4 },
      default: { w: 6, h: 4 },
    },
  },
  {
    type: 'cotizaciones_abiertas',
    label: 'Cotizaciones abiertas',
    chartTypes: ['kpi', 'bar'],
    hasDateRange: true,
    adminOnly: false,
    modulo: 'cotizaciones',
    defaultGrid: {
      kpi: { w: 3, h: 3 },
      bar: { w: 6, h: 4 },
      default: { w: 3, h: 3 },
    },
  },
  {
    type: 'top_clientes',
    label: 'Top clientes',
    chartTypes: ['table', 'bar'],
    hasDateRange: true,
    adminOnly: false,
    defaultGrid: { default: { w: 6, h: 5 } },
  },
  {
    type: 'top_productos',
    label: 'Top productos',
    chartTypes: ['table', 'bar'],
    hasDateRange: true,
    adminOnly: false,
    defaultGrid: { default: { w: 6, h: 5 } },
  },
  {
    type: 'stock_critico',
    label: 'Stock crítico',
    chartTypes: ['table'],
    hasDateRange: false,
    adminOnly: false,
    modulo: 'inventario',
    defaultGrid: { default: { w: 6, h: 5 } },
  },
  {
    type: 'nv_por_cobrar',
    label: 'Facturas por cobrar',
    chartTypes: ['kpi', 'table'],
    hasDateRange: false,
    adminOnly: false,
    modulo: 'facturas',
    defaultGrid: {
      kpi: { w: 3, h: 3 },
      table: { w: 6, h: 5 },
      default: { w: 3, h: 3 },
    },
  },
  {
    type: 'cotizaciones_por_vendedor',
    label: 'Cotizaciones por vendedor',
    chartTypes: ['table', 'bar'],
    hasDateRange: true,
    adminOnly: true,
    modulo: 'cotizaciones',
    defaultGrid: { default: { w: 6, h: 5 } },
  },
  {
    type: 'ventas_por_vendedor',
    label: 'Ventas por vendedor',
    chartTypes: ['table', 'bar'],
    hasDateRange: true,
    adminOnly: true,
    modulo: 'facturas',
    defaultGrid: { default: { w: 6, h: 5 } },
  },
]

export const WIDGET_BY_TYPE = Object.fromEntries(
  WIDGET_CATALOG.map(w => [w.type, w])
) as Record<WidgetType, WidgetDef>

export function getDefaultGrid(def: WidgetDef, chart: ChartType): { w: number; h: number } {
  return (def.defaultGrid as Record<string, { w: number; h: number }>)[chart] ?? def.defaultGrid.default
}

export function makeWidget(type: WidgetType, chart: ChartType): WidgetConfig {
  const def = WIDGET_BY_TYPE[type]
  const size = getDefaultGrid(def, chart)
  return {
    id: Math.random().toString(36).slice(2, 9),
    type,
    chart,
    date_range: 'month',
    limit: 10,
    grid: { x: 0, y: Infinity, w: size.w, h: size.h },
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

export interface DashboardTemplate {
  name: string
  widgets: Array<{ type: WidgetType; chart: ChartType }>
}

export const TEMPLATES: DashboardTemplate[] = [
  {
    name: 'Ventas',
    widgets: [
      { type: 'ventas_periodo', chart: 'line' },
      { type: 'top_clientes', chart: 'table' },
      { type: 'top_productos', chart: 'bar' },
    ],
  },
  {
    name: 'Operacional',
    widgets: [
      { type: 'cotizaciones_abiertas', chart: 'kpi' },
      { type: 'stock_critico', chart: 'table' },
      { type: 'nv_por_cobrar', chart: 'kpi' },
    ],
  },
  {
    name: 'Completo',
    widgets: [
      { type: 'ventas_periodo', chart: 'bar' },
      { type: 'cotizaciones_abiertas', chart: 'kpi' },
      { type: 'top_clientes', chart: 'table' },
      { type: 'top_productos', chart: 'table' },
      { type: 'stock_critico', chart: 'table' },
      { type: 'nv_por_cobrar', chart: 'kpi' },
      { type: 'cotizaciones_por_vendedor', chart: 'table' },
      { type: 'ventas_por_vendedor', chart: 'table' },
    ],
  },
]

export function applyTemplate(template: DashboardTemplate, adminOnly: boolean): WidgetConfig[] {
  return template.widgets
    .filter(w => adminOnly || !WIDGET_BY_TYPE[w.type].adminOnly)
    .map(w => makeWidget(w.type, w.chart))
}
