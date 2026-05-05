import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts'
import { FileSpreadsheet, FileText, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import { useModulos } from '../hooks/useModulos'
import { isModuloEnabled } from '../lib/modulos'
import type { Modulo } from '../lib/modulos'
import type {
  ReportesVentas,
  ReportesCobranza,
  ReportesInventario,
  ReportesCompras,
  ReportesMargenes,
  ReportesDte,
  ReportesPorMarca,
} from '../types'
import ClienteMultiSelect from '../components/ClienteMultiSelect'
import {
  Button,
  Input,
  FormField,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyState,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPresetDates(preset: string): { from: string; to: string } {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const toStr = iso(today)
  if (preset === 'este_mes') {
    return { from: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`, to: toStr }
  }
  if (preset === 'mes_anterior') {
    const y = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
    const m = today.getMonth() === 0 ? 12 : today.getMonth()
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: `${y}-${pad(m)}-01`, to: iso(lastDay) }
  }
  if (preset === 'este_anio') {
    return { from: `${today.getFullYear()}-01-01`, to: toStr }
  }
  if (preset === 'ultimos_3_meses') {
    const from = new Date(today)
    from.setMonth(from.getMonth() - 3)
    return { from: iso(from), to: toStr }
  }
  return { from: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`, to: toStr }
}

async function exportFile(
  tab: string,
  format: 'excel' | 'pdf' | 'csv',
  dateFrom: string,
  dateTo: string,
  extraQuery = '',
) {
  const extMap = { excel: 'xlsx', pdf: 'pdf', csv: 'csv' } as const
  const ext = extMap[format]
  const url = `/api/reportes/${tab}/export/${format}?date_from=${dateFrom}&date_to=${dateTo}${extraQuery}`
  const response = await api.get(url, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `${tab}-${dateFrom}-${dateTo}.${ext}`
  a.click()
  URL.revokeObjectURL(blobUrl)
}

// ── Shared sub-components ────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone = 'default',
  numeric = false,
}: {
  label: string
  value: string | number
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger'
  numeric?: boolean
}) {
  const toneClass =
    tone === 'info'
      ? 'text-info-600 dark:text-info-400'
      : tone === 'success'
        ? 'text-success-600 dark:text-success-400'
        : tone === 'warning'
          ? 'text-warning-600 dark:text-warning-400'
          : tone === 'danger'
            ? 'text-danger-600 dark:text-danger-400'
            : 'text-gray-900 dark:text-gray-100'
  return (
    <Card>
      <CardContent>
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
          {label}
        </p>
        <p className={`text-lg font-bold ${toneClass} ${numeric ? 'font-num' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function ExportButtons({
  tab,
  dateFrom,
  dateTo,
  extraQuery = '',
  formats = ['excel', 'pdf'],
}: {
  tab: string
  dateFrom: string
  dateTo: string
  extraQuery?: string
  formats?: Array<'excel' | 'pdf' | 'csv'>
}) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      {formats.includes('excel') && (
        <Button
          variant="outline"
          size="sm"
          leftIcon={<FileSpreadsheet />}
          onClick={() => exportFile(tab, 'excel', dateFrom, dateTo, extraQuery)}
        >
          Excel
        </Button>
      )}
      {formats.includes('csv') && (
        <Button
          variant="outline"
          size="sm"
          leftIcon={<FileText />}
          onClick={() => exportFile(tab, 'csv', dateFrom, dateTo, extraQuery)}
        >
          CSV
        </Button>
      )}
      {formats.includes('pdf') && (
        <Button
          variant="outline"
          size="sm"
          leftIcon={<FileText />}
          onClick={() => exportFile(tab, 'pdf', dateFrom, dateTo, extraQuery)}
        >
          PDF
        </Button>
      )}
    </div>
  )
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        {title && (
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
            {title}
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function LoadingBlock() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-lg" />
    </div>
  )
}

function ErrorBlock() {
  return (
    <Card padded>
      <EmptyState icon={<Inbox />} title="Error al cargar datos" />
    </Card>
  )
}

// Margin tone helper
function marginTone(pct: number): 'success' | 'warning' | 'danger' {
  if (pct >= 20) return 'success'
  if (pct >= 10) return 'warning'
  return 'danger'
}

function marginClass(pct: number): string {
  const tone = marginTone(pct)
  return tone === 'success'
    ? 'text-success-600 dark:text-success-400'
    : tone === 'warning'
      ? 'text-warning-600 dark:text-warning-400'
      : 'text-danger-600 dark:text-danger-400'
}

// ── Ventas Tab ────────────────────────────────────────────────────────────────

function VentasTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<ReportesVentas | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<ReportesVentas>(`/api/reportes/ventas?date_from=${dateFrom}&date_to=${dateTo}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  if (loading) return <LoadingBlock />
  if (!data) return <ErrorBlock />

  const varPct = data.kpis.variacion_vs_periodo_anterior
  const varClass = varPct >= 0 ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'
  const varSign = varPct >= 0 ? '+' : ''

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total vendido" value={`$${data.kpis.total_vendido.toLocaleString('es-CL')}`} tone="info" numeric />
        <KpiCard label="Facturas emitidas" value={data.kpis.num_facturas} numeric />
        <KpiCard label="Ticket promedio" value={`$${data.kpis.ticket_promedio.toLocaleString('es-CL')}`} numeric />
        <KpiCard label="Por cobrar" value={`$${data.kpis.total_por_cobrar.toLocaleString('es-CL')}`} tone="warning" numeric />
      </div>
      <div className="text-right text-xs">
        <span className="text-gray-500 dark:text-gray-400">vs. período anterior: </span>
        <span className={`${varClass} font-num`}>{varSign}{varPct.toFixed(1)}%</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Ventas diarias">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={data.ventas_diarias}>
              <XAxis dataKey="fecha" hide />
              <YAxis hide />
              <RechartsTooltip formatter={(v) => '$' + Number(v).toLocaleString('es-CL')} />
              <Bar dataKey="monto" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Top clientes">
          <div className="space-y-1.5">
            {data.top_clientes.slice(0, 5).map(c => (
              <div key={c.cliente_id} className="flex justify-between items-center text-xs">
                <span className="text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{c.nombre}</span>
                <span className="text-gray-500 dark:text-gray-400 font-num">${c.total.toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Por vendedor">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.por_vendedor.map(v => (
            <div key={v.vendedor_id} className="rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-2.5">
              <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{v.nombre}</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-num">${v.total.toLocaleString('es-CL')}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">{v.num_facturas} fact.</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <ExportButtons tab="ventas" dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  )
}

// ── Cobranza Tab ──────────────────────────────────────────────────────────────

function CobranzaTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<ReportesCobranza | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<ReportesCobranza>(`/api/reportes/cobranza?date_from=${dateFrom}&date_to=${dateTo}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  if (loading) return <LoadingBlock />
  if (!data) return <ErrorBlock />

  const ag = data.aging
  const agingData = [
    { name: '0-30d', monto: ag.d_0_30.monto },
    { name: '31-60d', monto: ag.d_31_60.monto },
    { name: '61-90d', monto: ag.d_61_90.monto },
    { name: '90+d', monto: ag.d_90_plus.monto },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total por cobrar" value={`$${data.kpis.total_por_cobrar.toLocaleString('es-CL')}`} tone="info" numeric />
        <KpiCard label="Total vencido" value={`$${data.kpis.total_vencido.toLocaleString('es-CL')}`} tone="danger" numeric />
        <KpiCard label="Vencen en 7 días" value={`$${data.kpis.proximas_a_vencer_7d.toLocaleString('es-CL')}`} tone="warning" numeric />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Aging de deuda">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={agingData} layout="vertical">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={40} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <RechartsTooltip formatter={(v) => '$' + Number(v).toLocaleString('es-CL')} />
              <Bar dataKey="monto" radius={[0, 3, 3, 0]}>
                {agingData.map((_, i) => (
                  <Cell key={i} fill={['#34d399', '#fbbf24', '#f97316', '#f87171'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Por empresa">
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
            {data.por_empresa.map(e => (
              <div key={e.empresa_id} className="flex justify-between items-center text-xs">
                <span className="text-gray-700 dark:text-gray-300 truncate max-w-[55%]">{e.nombre}</span>
                <span className="text-gray-500 dark:text-gray-400 font-num">${e.saldo.toLocaleString('es-CL')}</span>
                <span className={`font-num ${e.dias_vencida > 0 ? 'text-danger-600 dark:text-danger-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {e.dias_vencida > 0 ? `${e.dias_vencida}d` : '—'}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <ExportButtons tab="cobranza" dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  )
}

// ── Inventario Tab ────────────────────────────────────────────────────────────

function InventarioTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<ReportesInventario | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<ReportesInventario>(`/api/reportes/inventario?date_from=${dateFrom}&date_to=${dateTo}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  if (loading) return <LoadingBlock />
  if (!data) return <ErrorBlock />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Valor total stock" value={`$${data.kpis.valor_total_stock.toLocaleString('es-CL')}`} tone="info" numeric />
        <KpiCard label="Bajo mínimo" value={data.kpis.num_bajo_minimo} tone="warning" numeric />
        <KpiCard label="Sin stock" value={data.kpis.num_sin_stock} tone="danger" numeric />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Productos bajo mínimo">
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {data.bajo_minimo.length === 0 && (
              <div className="text-gray-500 dark:text-gray-400 text-xs">Sin productos bajo mínimo</div>
            )}
            {data.bajo_minimo.map(p => (
              <div key={p.producto_id} className="flex justify-between items-center text-xs py-0.5 border-b border-gray-100 dark:border-gray-800/60">
                <div>
                  <span className="text-gray-700 dark:text-gray-300">{p.nombre}</span>
                  {p.sku && <span className="text-gray-500 dark:text-gray-500 ml-1">({p.sku})</span>}
                </div>
                <span className="text-danger-600 dark:text-danger-400 font-num">{p.stock_actual} / {p.stock_minimo}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Más vendidos">
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {data.top_vendidos.map((p, i) => (
              <div key={p.producto_id} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 dark:text-gray-500 w-4 font-num">{i + 1}.</span>
                <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">{p.nombre}</span>
                <span className="text-gray-500 dark:text-gray-400 font-num">{p.cantidad_vendida} u.</span>
                <span className="text-warning-600 dark:text-warning-400 font-num">${p.monto_total.toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <ExportButtons tab="inventario" dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  )
}

// ── Compras Tab ───────────────────────────────────────────────────────────────

function ComprasTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<ReportesCompras | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<ReportesCompras>(`/api/reportes/compras?date_from=${dateFrom}&date_to=${dateTo}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  if (loading) return <LoadingBlock />
  if (!data) return <ErrorBlock />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total comprado" value={`$${data.kpis.total_comprado.toLocaleString('es-CL')}`} tone="info" numeric />
        <KpiCard label="OC emitidas" value={data.kpis.num_oc_emitidas} numeric />
        <KpiCard label="OC pendientes" value={data.kpis.num_oc_pendientes} tone="warning" numeric />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Por proveedor">
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {data.por_proveedor.map(p => (
              <div key={p.proveedor_id} className="flex justify-between items-center text-xs">
                <span className="text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{p.nombre}</span>
                <span className="text-gray-500 dark:text-gray-400 font-num">{p.num_oc} OC</span>
                <span className="text-gray-500 dark:text-gray-400 font-num">${p.total.toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Por estado">
          <div className="space-y-1.5">
            {data.por_estado.map(e => (
              <div key={e.estado} className="flex justify-between items-center text-xs">
                <span className="text-gray-700 dark:text-gray-300 capitalize">{e.estado.replace('_', ' ')}</span>
                <span className="text-gray-500 dark:text-gray-400 font-num">{e.count}</span>
                <span className="text-gray-500 dark:text-gray-400 font-num">${e.total.toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <ExportButtons tab="compras" dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  )
}

// ── Márgenes Tab ──────────────────────────────────────────────────────────────

function MargenesTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<ReportesMargenes | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<ReportesMargenes>(`/api/reportes/margenes?date_from=${dateFrom}&date_to=${dateTo}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  if (loading) return <LoadingBlock />
  if (!data) return <ErrorBlock />

  const { kpis } = data

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Margen promedio"
          value={`${kpis.margen_promedio_pct.toFixed(1)}%`}
          tone={kpis.margen_promedio_pct >= 0 ? 'success' : 'danger'}
          numeric
        />
        <KpiCard
          label="Mejor producto"
          value={kpis.mejor_producto ? `${kpis.mejor_producto.nombre} (${kpis.mejor_producto.margen_pct.toFixed(1)}%)` : '—'}
        />
        <KpiCard
          label="Peor producto"
          value={kpis.peor_producto ? `${kpis.peor_producto.nombre} (${kpis.peor_producto.margen_pct.toFixed(1)}%)` : '—'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Por producto (top 10)">
          <Table density="compact">
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH className="text-right">Cant.</TH>
                <TH className="text-right">Margen %</TH>
              </TR>
            </THead>
            <TBody>
              {data.por_producto.slice(0, 10).map(p => (
                <TR key={p.producto_id}>
                  <TD className="truncate max-w-[140px]">{p.nombre}</TD>
                  <TD className="text-right font-num">{p.cantidad_vendida}</TD>
                  <TD className={`text-right font-medium font-num ${marginClass(p.margen_pct)}`}>
                    {p.margen_pct.toFixed(1)}%
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </SectionCard>

        <SectionCard title="Por factura (top 10)">
          <Table density="compact">
            <THead>
              <TR>
                <TH>Factura</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Margen %</TH>
              </TR>
            </THead>
            <TBody>
              {data.por_factura.slice(0, 10).map(f => (
                <TR key={f.factura_id}>
                  <TD className="font-num">#{f.numero}</TD>
                  <TD className="text-right font-num">${f.total.toLocaleString('es-CL')}</TD>
                  <TD className={`text-right font-medium font-num ${marginClass(f.margen_pct)}`}>
                    {f.margen_pct.toFixed(1)}%
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </SectionCard>
      </div>

      <ExportButtons tab="margenes" dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  )
}

// ── Por Marca Tab ─────────────────────────────────────────────────────────────

function MarcaTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [clienteIds, setClienteIds] = useState<number[]>([])
  const [data, setData] = useState<ReportesPorMarca | null>(null)
  const [loading, setLoading] = useState(true)
  const [subtab, setSubtab] = useState<'marca' | 'marca_cliente'>('marca')

  const extraQuery = clienteIds.map(id => `&cliente_id=${id}`).join('')

  useEffect(() => {
    setLoading(true)
    api.get<ReportesPorMarca>(
      `/api/reportes/por-marca?date_from=${dateFrom}&date_to=${dateTo}${extraQuery}`
    )
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, extraQuery])

  if (loading) return <LoadingBlock />
  if (!data) return <ErrorBlock />

  const fmt = (n: number) => `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500 dark:text-gray-400">Clientes:</span>
        <ClienteMultiSelect selected={clienteIds} onChange={setClienteIds} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Neto total" value={fmt(data.kpis.total_neto)} tone="info" numeric />
        <KpiCard label="Ganancia total" value={fmt(data.kpis.ganancia_total)} tone="success" numeric />
        <KpiCard
          label="Margen promedio"
          value={`${data.kpis.margen_promedio_pct.toFixed(1)}%`}
          tone={data.kpis.margen_promedio_pct >= 0 ? 'success' : 'danger'}
          numeric
        />
        <KpiCard label="Facturas" value={data.kpis.num_facturas} numeric />
        <KpiCard label="Marcas" value={data.kpis.num_marcas} numeric />
        <KpiCard label="Ticket promedio" value={fmt(data.kpis.ticket_promedio)} numeric />
        <KpiCard label="Cantidad total" value={data.kpis.cantidad_total.toLocaleString('es-CL')} numeric />
        <KpiCard label="Bruto total" value={fmt(data.kpis.total_bruto)} numeric />
      </div>

      <Tabs value={subtab} onValueChange={(v) => setSubtab(v as 'marca' | 'marca_cliente')}>
        <TabsList variant="underline">
          <TabsTrigger value="marca">Por Marca</TabsTrigger>
          <TabsTrigger value="marca_cliente">Marca + Cliente</TabsTrigger>
        </TabsList>

        <TabsContent value="marca">
          <Card>
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Marca</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH className="text-right">Neto</TH>
                  <TH className="text-right">Ganancia</TH>
                  <TH className="text-right">Margen %</TH>
                  <TH className="text-right">Facturas</TH>
                  <TH className="text-right">Clientes</TH>
                  <TH className="text-right">Ticket prom.</TH>
                </TR>
              </THead>
              <TBody>
                {data.por_marca.map(m => (
                  <TR key={m.marca_id}>
                    <TD>{m.nombre}</TD>
                    <TD className="text-right font-num">{m.cantidad.toLocaleString('es-CL')}</TD>
                    <TD className="text-right font-num">{fmt(m.neto)}</TD>
                    <TD className="text-right font-num">{fmt(m.ganancia)}</TD>
                    <TD className={`text-right font-num ${marginClass(m.margen_pct)}`}>
                      {m.margen_pct.toFixed(1)}%
                    </TD>
                    <TD className="text-right font-num">{m.num_facturas}</TD>
                    <TD className="text-right font-num">{m.num_clientes}</TD>
                    <TD className="text-right font-num">{fmt(m.ticket_promedio)}</TD>
                  </TR>
                ))}
                {data.sin_marca.neto > 0 && (
                  <TR className="text-gray-500 dark:text-gray-400 italic">
                    <TD>(Sin marca)</TD>
                    <TD className="text-right font-num">{data.sin_marca.cantidad.toLocaleString('es-CL')}</TD>
                    <TD className="text-right font-num">{fmt(data.sin_marca.neto)}</TD>
                    <TD className="text-right font-num">{fmt(data.sin_marca.ganancia)}</TD>
                    <TD className="text-right">—</TD>
                    <TD className="text-right">—</TD>
                    <TD className="text-right">—</TD>
                    <TD className="text-right">—</TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="marca_cliente">
          <Card>
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Marca</TH>
                  <TH>Cliente</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH className="text-right">Neto</TH>
                  <TH className="text-right">Ganancia</TH>
                  <TH className="text-right">Margen %</TH>
                  <TH className="text-right">Facturas</TH>
                </TR>
              </THead>
              <TBody>
                {data.por_marca_cliente.map(r => (
                  <TR key={`${r.marca_id}-${r.cliente_id}`}>
                    <TD>{r.marca_nombre}</TD>
                    <TD>{r.cliente_nombre}</TD>
                    <TD className="text-right font-num">{r.cantidad.toLocaleString('es-CL')}</TD>
                    <TD className="text-right font-num">{fmt(r.neto)}</TD>
                    <TD className="text-right font-num">{fmt(r.ganancia)}</TD>
                    <TD className={`text-right font-num ${marginClass(r.margen_pct)}`}>
                      {r.margen_pct.toFixed(1)}%
                    </TD>
                    <TD className="text-right font-num">{r.num_facturas}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <ExportButtons
        tab="por-marca"
        dateFrom={dateFrom}
        dateTo={dateTo}
        extraQuery={extraQuery}
        formats={['excel', 'csv']}
      />
    </div>
  )
}

// ── DTE Tab ───────────────────────────────────────────────────────────────────

function DteTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [data, setData] = useState<ReportesDte | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<ReportesDte>(`/api/reportes/dte?date_from=${dateFrom}&date_to=${dateTo}`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  if (loading) return <LoadingBlock />
  if (!data) return <ErrorBlock />

  const estadoClass: Record<string, string> = {
    aceptada: 'text-success-600 dark:text-success-400',
    rechazada: 'text-danger-600 dark:text-danger-400',
    pendiente: 'text-warning-600 dark:text-warning-400',
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total emitidos" value={data.kpis.total_emitidos} numeric />
        <KpiCard label="Aceptadas" value={data.kpis.aceptadas} tone="success" numeric />
        <KpiCard label="Rechazadas" value={data.kpis.rechazadas} tone="danger" numeric />
        <KpiCard label="Pendientes" value={data.kpis.pendientes} tone="warning" numeric />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Por tipo de documento">
          <div className="space-y-1.5">
            {data.por_tipo.map(t => (
              <div key={t.tipo} className="flex justify-between items-center text-xs">
                <span className="text-gray-700 dark:text-gray-300">{t.label}</span>
                <span className="text-gray-500 dark:text-gray-400 font-num">{t.count} ({t.aceptadas} acept.)</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title="Emisiones">
            <Table density="compact">
              <THead>
                <TR>
                  <TH>Tipo</TH>
                  <TH>Folio</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">Monto</TH>
                  <TH>Fecha</TH>
                </TR>
              </THead>
              <TBody>
                {data.emisiones.map(e => (
                  <TR key={e.id}>
                    <TD>{e.tipo}</TD>
                    <TD className="font-num">{e.folio ?? '—'}</TD>
                    <TD className={`font-medium capitalize ${estadoClass[e.estado] ?? 'text-gray-500 dark:text-gray-400'}`}>{e.estado}</TD>
                    <TD className="text-right font-num">${e.monto_total.toLocaleString('es-CL')}</TD>
                    <TD className="font-num text-gray-500 dark:text-gray-400">{e.created_at ? e.created_at.slice(0, 10) : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </SectionCard>
        </div>
      </div>

      <ExportButtons tab="dte" dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'ventas' | 'cobranza' | 'inventario' | 'compras' | 'margenes' | 'por_marca' | 'dte'

const TABS: { id: Tab; label: string; modulo?: Modulo }[] = [
  { id: 'ventas', label: 'Ventas', modulo: 'facturas' },
  { id: 'cobranza', label: 'Cobranza', modulo: 'cobranza' },
  { id: 'inventario', label: 'Inventario', modulo: 'inventario' },
  { id: 'compras', label: 'Compras', modulo: 'ordenes_compra' },
  { id: 'margenes', label: 'Márgenes', modulo: 'facturas' },
  { id: 'por_marca', label: 'Por Marca', modulo: 'facturas' },
  { id: 'dte', label: 'DTE', modulo: 'facturas' },
]

const PRESETS = [
  { id: 'este_mes', label: 'Este mes' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'este_anio', label: 'Este año' },
  { id: 'ultimos_3_meses', label: 'Últimos 3 meses' },
  { id: 'personalizado', label: 'Rango personalizado' },
]

export default function Reportes() {
  const { effective: modulos } = useModulos()

  const visibleTabs = useMemo(
    () => TABS.filter(t => !t.modulo || isModuloEnabled(modulos, t.modulo)),
    [modulos],
  )

  const [activeTab, setActiveTab] = useState<Tab>('ventas')
  const [preset, setPreset] = useState('este_mes')
  const defaultDates = getPresetDates('este_mes')
  const [dateFrom, setDateFrom] = useState(defaultDates.from)
  const [dateTo, setDateTo] = useState(defaultDates.to)

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id)
    }
  }, [visibleTabs, activeTab])

  function handlePresetChange(p: string) {
    setPreset(p)
    if (p !== 'personalizado') {
      const { from, to } = getPresetDates(p)
      setDateFrom(from)
      setDateTo(to)
    }
  }

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Reportes</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Análisis y métricas del negocio</p>
        </div>

        {/* Date range controls */}
        <Card padded className="!py-3">
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Período">
              <Select value={preset} onValueChange={handlePresetChange}>
                <SelectTrigger size="sm" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {preset === 'personalizado' ? (
              <>
                <FormField label="Desde">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    size="sm"
                  />
                </FormField>
                <FormField label="Hasta">
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    size="sm"
                  />
                </FormField>
              </>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400 pb-2 font-num">
                {dateFrom} → {dateTo}
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList variant="underline" className="overflow-x-auto">
          {visibleTabs.map(t => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ventas"><VentasTab dateFrom={dateFrom} dateTo={dateTo} /></TabsContent>
        <TabsContent value="cobranza"><CobranzaTab dateFrom={dateFrom} dateTo={dateTo} /></TabsContent>
        <TabsContent value="inventario"><InventarioTab dateFrom={dateFrom} dateTo={dateTo} /></TabsContent>
        <TabsContent value="compras"><ComprasTab dateFrom={dateFrom} dateTo={dateTo} /></TabsContent>
        <TabsContent value="margenes"><MargenesTab dateFrom={dateFrom} dateTo={dateTo} /></TabsContent>
        <TabsContent value="por_marca"><MarcaTab dateFrom={dateFrom} dateTo={dateTo} /></TabsContent>
        <TabsContent value="dte"><DteTab dateFrom={dateFrom} dateTo={dateTo} /></TabsContent>
      </Tabs>
    </div>
  )
}
