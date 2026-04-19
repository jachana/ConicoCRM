// frontend/src/components/dashboard/Widget.tsx
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import { Settings, X, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { WidgetConfig } from '../../types/dashboard'
import type {
  VentasPeriodoOut, CotizacionesAbiertasOut,
  TopClienteItem, TopProductoItem,
  StockCriticoItem, NVPorCobrarOut, VendedorMetricaItem,
} from '../../types/dashboard'
import { WIDGET_BY_TYPE } from './widgetCatalog'

function formatMoney(n: number) {
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
}

function buildParams(w: WidgetConfig) {
  const p = new URLSearchParams()
  if (w.date_range !== 'custom') {
    const today = new Date()
    const from = new Date(today)
    if (w.date_range === 'today') from.setDate(today.getDate())
    else if (w.date_range === 'week') from.setDate(today.getDate() - today.getDay() + 1)
    else if (w.date_range === 'month') from.setDate(1)
    else if (w.date_range === 'quarter') from.setMonth(Math.floor(today.getMonth() / 3) * 3, 1)
    else if (w.date_range === 'year') from.setMonth(0, 1)
    p.set('date_from', from.toISOString().split('T')[0])
    p.set('date_to', today.toISOString().split('T')[0])
  } else {
    if (w.date_from) p.set('date_from', w.date_from)
    if (w.date_to) p.set('date_to', w.date_to)
  }
  p.set('limit', String(w.limit))
  return p.toString()
}

// ── Chart renderers ────────────────────────────────────────────────────────────

function KpiCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <span className="text-3xl font-bold text-blue-500 dark:text-blue-400">{value}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  )
}

function SimpleBarChart({ data, xKey, yKey }: { data: object[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={50} />
        <Tooltip formatter={(v: number) => formatMoney(v)} />
        <Bar dataKey={yKey} fill="#6366f1" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function SimpleLineChart({ data, xKey, yKey }: { data: object[]; xKey: string; yKey: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={50} />
        <Tooltip formatter={(v: number) => formatMoney(v)} />
        <Line type="monotone" dataKey={yKey} stroke="#6366f1" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Per-widget render ──────────────────────────────────────────────────────────

function RenderVentas({ data, chart }: { data: VentasPeriodoOut; chart: string }) {
  if (chart === 'kpi') return <KpiCard value={formatMoney(data.total)} label="Ventas del período" />
  if (chart === 'line') return <SimpleLineChart data={data.series} xKey="periodo" yKey="monto" />
  return <SimpleBarChart data={data.series} xKey="periodo" yKey="monto" />
}

function RenderCotizaciones({ data, chart }: { data: CotizacionesAbiertasOut; chart: string }) {
  if (chart === 'kpi') return <KpiCard value={String(data.total)} label="Cotizaciones abiertas" />
  return <SimpleBarChart data={data.por_estado} xKey="estado" yKey="count" />
}

function RenderTopClientes({ data, chart }: { data: TopClienteItem[]; chart: string }) {
  if (chart === 'bar') return <SimpleBarChart data={data} xKey="nombre" yKey="total" />
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">Cliente</th>
          <th className="text-right py-1 px-2">Total</th>
        </tr></thead>
        <tbody>{data.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2 truncate max-w-[150px]">{r.nombre}</td>
            <td className="py-1 px-2 text-right">{formatMoney(r.total)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function RenderTopProductos({ data, chart }: { data: TopProductoItem[]; chart: string }) {
  if (chart === 'bar') return <SimpleBarChart data={data} xKey="nombre" yKey="total" />
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">Producto</th>
          <th className="text-right py-1 px-2">Cant.</th>
          <th className="text-right py-1 px-2">Total</th>
        </tr></thead>
        <tbody>{data.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2 truncate max-w-[120px]">{r.nombre}</td>
            <td className="py-1 px-2 text-right">{r.cantidad}</td>
            <td className="py-1 px-2 text-right">{formatMoney(r.total)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function RenderStockCritico({ data }: { data: StockCriticoItem[] }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">Producto</th>
          <th className="text-right py-1 px-2">Actual</th>
          <th className="text-right py-1 px-2">Mínimo</th>
        </tr></thead>
        <tbody>{data.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2 truncate max-w-[130px]">{r.nombre}</td>
            <td className="py-1 px-2 text-right text-red-600 font-medium">{r.stock_actual}</td>
            <td className="py-1 px-2 text-right text-gray-500">{r.stock_minimo}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function RenderNVPorCobrar({ data, chart }: { data: NVPorCobrarOut; chart: string }) {
  if (chart === 'kpi') return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <span className="text-3xl font-bold text-orange-500">{formatMoney(data.total_monto)}</span>
      <span className="text-xs text-gray-500">{data.count} NV por cobrar</span>
    </div>
  )
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">NV</th>
          <th className="text-left py-1 px-2">Cliente</th>
          <th className="text-right py-1 px-2">Total</th>
        </tr></thead>
        <tbody>{data.items.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2">#{r.numero}</td>
            <td className="py-1 px-2 truncate max-w-[120px]">{r.cliente}</td>
            <td className="py-1 px-2 text-right">{formatMoney(r.total)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function RenderVendedorMetrica({ data, chart }: { data: VendedorMetricaItem[]; chart: string }) {
  if (chart === 'bar') return <SimpleBarChart data={data} xKey="nombre" yKey="total" />
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left py-1 px-2">Vendedor</th>
          <th className="text-right py-1 px-2">Docs</th>
          <th className="text-right py-1 px-2">Total</th>
        </tr></thead>
        <tbody>{data.map((r, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
            <td className="py-1 px-2">{r.nombre}</td>
            <td className="py-1 px-2 text-right">{r.count}</td>
            <td className="py-1 px-2 text-right">{formatMoney(r.total)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function WidgetContent({ widget, data }: { widget: WidgetConfig; data: unknown }) {
  switch (widget.type) {
    case 'ventas_periodo': return <RenderVentas data={data as VentasPeriodoOut} chart={widget.chart} />
    case 'cotizaciones_abiertas': return <RenderCotizaciones data={data as CotizacionesAbiertasOut} chart={widget.chart} />
    case 'top_clientes': return <RenderTopClientes data={data as TopClienteItem[]} chart={widget.chart} />
    case 'top_productos': return <RenderTopProductos data={data as TopProductoItem[]} chart={widget.chart} />
    case 'stock_critico': return <RenderStockCritico data={data as StockCriticoItem[]} />
    case 'nv_por_cobrar': return <RenderNVPorCobrar data={data as NVPorCobrarOut} chart={widget.chart} />
    case 'cotizaciones_por_vendedor':
    case 'ventas_por_vendedor': return <RenderVendedorMetrica data={data as VendedorMetricaItem[]} chart={widget.chart} />
    default: return <div className="text-xs text-gray-400">Widget desconocido</div>
  }
}

// ── Main Widget component ──────────────────────────────────────────────────────

interface WidgetProps {
  widget: WidgetConfig
  editMode: boolean
  onConfigure: (id: string) => void
  onRemove: (id: string) => void
}

export default function Widget({ widget, editMode, onConfigure, onRemove }: WidgetProps) {
  const def = WIDGET_BY_TYPE[widget.type]
  const params = buildParams(widget)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['widget-data', widget.type, params],
    queryFn: () => api.get(`/api/dashboard/data/${widget.type}?${params}`).then(r => r.data),
  })

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 truncate">{def.label}</span>
        {editMode && (
          <div className="flex gap-1 flex-shrink-0 ml-2">
            <button
              onClick={() => onConfigure(widget.id)}
              className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <Settings size={13} />
            </button>
            <button
              onClick={() => onRemove(widget.id)}
              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 p-2 min-h-0">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-full text-xs text-red-400">
            Error al cargar datos
          </div>
        )}
        {data && <WidgetContent widget={widget} data={data} />}
      </div>
    </div>
  )
}
