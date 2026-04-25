import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { api } from '../lib/api'
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

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-900 border border-white/[0.08] rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-white text-lg font-bold">{value}</div>
    </div>
  )
}

function ExportButtons({ tab, dateFrom, dateTo }: { tab: string; dateFrom: string; dateTo: string }) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button
        onClick={() => exportFile(tab, 'excel', dateFrom, dateTo)}
        className="bg-gray-900 border border-white/[0.1] text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-800"
      >
        ↓ Excel
      </button>
      <button
        onClick={() => exportFile(tab, 'pdf', dateFrom, dateTo)}
        className="bg-gray-900 border border-white/[0.1] text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-800"
      >
        ↓ PDF
      </button>
    </div>
  )
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-white/[0.08] rounded-xl p-4">
      {title && <div className="text-xs uppercase tracking-wider text-gray-500 mb-3">{title}</div>}
      {children}
    </div>
  )
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

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Cargando...</div>
  if (!data) return <div className="text-red-400 text-sm py-8 text-center">Error al cargar datos</div>

  const varPct = data.kpis.variacion_vs_periodo_anterior
  const varColor = varPct >= 0 ? 'text-emerald-400' : 'text-red-400'
  const varSign = varPct >= 0 ? '+' : ''

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Total vendido" value={`$${data.kpis.total_vendido.toLocaleString('es-CL')}`} />
        <KpiCard label="Facturas emitidas" value={data.kpis.num_facturas} />
        <KpiCard label="Ticket promedio" value={`$${data.kpis.ticket_promedio.toLocaleString('es-CL')}`} />
        <KpiCard label="Por cobrar" value={`$${data.kpis.total_por_cobrar.toLocaleString('es-CL')}`} />
      </div>
      <div className="mb-1 text-right text-xs">
        <span className="text-gray-500">vs. período anterior: </span>
        <span className={varColor}>{varSign}{varPct.toFixed(1)}%</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Ventas diarias">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={data.ventas_diarias}>
              <XAxis dataKey="fecha" hide />
              <YAxis hide />
              <Tooltip formatter={(v) => '$' + Number(v).toLocaleString('es-CL')} />
              <Bar dataKey="monto" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Top clientes">
          <div className="space-y-1.5">
            {data.top_clientes.slice(0, 5).map(c => (
              <div key={c.cliente_id} className="flex justify-between items-center text-xs">
                <span className="text-gray-300 truncate max-w-[60%]">{c.nombre}</span>
                <span className="text-gray-400">${c.total.toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Por vendedor">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.por_vendedor.map(v => (
            <div key={v.vendedor_id} className="bg-gray-800 rounded-lg p-2.5">
              <div className="text-[10px] text-gray-500 truncate">{v.nombre}</div>
              <div className="text-white text-sm font-semibold">${v.total.toLocaleString('es-CL')}</div>
              <div className="text-[10px] text-gray-500">{v.num_facturas} fact.</div>
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

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Cargando...</div>
  if (!data) return <div className="text-red-400 text-sm py-8 text-center">Error al cargar datos</div>

  const ag = data.aging
  const agingData = [
    { name: '0-30d', monto: ag.d_0_30.monto },
    { name: '31-60d', monto: ag.d_31_60.monto },
    { name: '61-90d', monto: ag.d_61_90.monto },
    { name: '90+d', monto: ag.d_90_plus.monto },
  ]

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard label="Total por cobrar" value={`$${data.kpis.total_por_cobrar.toLocaleString('es-CL')}`} />
        <KpiCard label="Total vencido" value={`$${data.kpis.total_vencido.toLocaleString('es-CL')}`} />
        <KpiCard label="Vencen en 7 días" value={`$${data.kpis.proximas_a_vencer_7d.toLocaleString('es-CL')}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Aging de deuda">
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={agingData} layout="vertical">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={40} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip formatter={(v) => '$' + Number(v).toLocaleString('es-CL')} />
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
                <span className="text-gray-300 truncate max-w-[55%]">{e.nombre}</span>
                <span className="text-gray-400">${e.saldo.toLocaleString('es-CL')}</span>
                <span className={e.dias_vencida > 0 ? 'text-red-400' : 'text-gray-500'}>
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

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Cargando...</div>
  if (!data) return <div className="text-red-400 text-sm py-8 text-center">Error al cargar datos</div>

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard label="Valor total stock" value={`$${data.kpis.valor_total_stock.toLocaleString('es-CL')}`} />
        <KpiCard label="Bajo mínimo" value={data.kpis.num_bajo_minimo} />
        <KpiCard label="Sin stock" value={data.kpis.num_sin_stock} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Productos bajo mínimo">
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {data.bajo_minimo.length === 0 && (
              <div className="text-gray-500 text-xs">Sin productos bajo mínimo</div>
            )}
            {data.bajo_minimo.map(p => (
              <div key={p.producto_id} className="flex justify-between items-center text-xs py-0.5 border-b border-white/[0.04]">
                <div>
                  <span className="text-gray-300">{p.nombre}</span>
                  {p.sku && <span className="text-gray-600 ml-1">({p.sku})</span>}
                </div>
                <span className="text-red-400">{p.stock_actual} / {p.stock_minimo}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Más vendidos">
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {data.top_vendidos.map((p, i) => (
              <div key={p.producto_id} className="flex items-center gap-2 text-xs">
                <span className="text-gray-600 w-4">{i + 1}.</span>
                <span className="text-gray-300 flex-1 truncate">{p.nombre}</span>
                <span className="text-gray-400">{p.cantidad_vendida} u.</span>
                <span className="text-amber-400">${p.monto_total.toLocaleString('es-CL')}</span>
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

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Cargando...</div>
  if (!data) return <div className="text-red-400 text-sm py-8 text-center">Error al cargar datos</div>

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard label="Total comprado" value={`$${data.kpis.total_comprado.toLocaleString('es-CL')}`} />
        <KpiCard label="OC emitidas" value={data.kpis.num_oc_emitidas} />
        <KpiCard label="OC pendientes" value={data.kpis.num_oc_pendientes} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Por proveedor">
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {data.por_proveedor.map(p => (
              <div key={p.proveedor_id} className="flex justify-between items-center text-xs">
                <span className="text-gray-300 truncate max-w-[60%]">{p.nombre}</span>
                <span className="text-gray-500">{p.num_oc} OC</span>
                <span className="text-gray-400">${p.total.toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Por estado">
          <div className="space-y-1.5">
            {data.por_estado.map(e => (
              <div key={e.estado} className="flex justify-between items-center text-xs">
                <span className="text-gray-300 capitalize">{e.estado.replace('_', ' ')}</span>
                <span className="text-gray-500">{e.count}</span>
                <span className="text-gray-400">${e.total.toLocaleString('es-CL')}</span>
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

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Cargando...</div>
  if (!data) return <div className="text-red-400 text-sm py-8 text-center">Error al cargar datos</div>

  const { kpis } = data

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <KpiCard label="Margen promedio" value={`${kpis.margen_promedio_pct.toFixed(1)}%`} />
        <KpiCard
          label="Mejor producto"
          value={kpis.mejor_producto ? `${kpis.mejor_producto.nombre} (${kpis.mejor_producto.margen_pct.toFixed(1)}%)` : '—'}
        />
        <KpiCard
          label="Peor producto"
          value={kpis.peor_producto ? `${kpis.peor_producto.nombre} (${kpis.peor_producto.margen_pct.toFixed(1)}%)` : '—'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Por producto (top 10)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 border-b border-white/[0.06]">
                  <th className="text-left pb-1.5 pr-2">Producto</th>
                  <th className="text-right pb-1.5 pr-2">Cant.</th>
                  <th className="text-right pb-1.5">Margen %</th>
                </tr>
              </thead>
              <tbody>
                {data.por_producto.slice(0, 10).map(p => (
                  <tr key={p.producto_id} className="border-b border-white/[0.03]">
                    <td className="py-1 pr-2 text-gray-300 truncate max-w-[140px]">{p.nombre}</td>
                    <td className="py-1 pr-2 text-gray-400 text-right">{p.cantidad_vendida}</td>
                    <td className={`py-1 text-right font-medium ${p.margen_pct >= 20 ? 'text-emerald-400' : p.margen_pct >= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                      {p.margen_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Por factura (top 10)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 border-b border-white/[0.06]">
                  <th className="text-left pb-1.5 pr-2">Factura</th>
                  <th className="text-right pb-1.5 pr-2">Total</th>
                  <th className="text-right pb-1.5">Margen %</th>
                </tr>
              </thead>
              <tbody>
                {data.por_factura.slice(0, 10).map(f => (
                  <tr key={f.factura_id} className="border-b border-white/[0.03]">
                    <td className="py-1 pr-2 text-gray-300">#{f.numero}</td>
                    <td className="py-1 pr-2 text-gray-400 text-right">${f.total.toLocaleString('es-CL')}</td>
                    <td className={`py-1 text-right font-medium ${f.margen_pct >= 20 ? 'text-emerald-400' : f.margen_pct >= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                      {f.margen_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Cargando...</div>
  if (!data) return <div className="text-red-400 text-sm py-8 text-center">Error al cargar datos</div>

  const fmt = (n: number) => `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-gray-500">Clientes:</span>
        <ClienteMultiSelect selected={clienteIds} onChange={setClienteIds} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Neto total" value={fmt(data.kpis.total_neto)} />
        <KpiCard label="Ganancia total" value={fmt(data.kpis.ganancia_total)} />
        <KpiCard label="Margen promedio" value={`${data.kpis.margen_promedio_pct.toFixed(1)}%`} />
        <KpiCard label="Facturas" value={data.kpis.num_facturas} />
        <KpiCard label="Marcas" value={data.kpis.num_marcas} />
        <KpiCard label="Ticket promedio" value={fmt(data.kpis.ticket_promedio)} />
        <KpiCard label="Cantidad total" value={data.kpis.cantidad_total.toLocaleString('es-CL')} />
        <KpiCard label="Bruto total" value={fmt(data.kpis.total_bruto)} />
      </div>

      <div className="flex gap-1 border-b border-white/[0.06] mb-3">
        {(['marca', 'marca_cliente'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`px-3 py-1.5 text-xs font-medium ${
              subtab === t
                ? 'border-b-2 border-amber-400 text-amber-400'
                : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
            }`}
          >
            {t === 'marca' ? 'Por Marca' : 'Marca + Cliente'}
          </button>
        ))}
      </div>

      {subtab === 'marca' && (
        <SectionCard>
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-1.5">Marca</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Neto</th>
                <th className="text-right">Ganancia</th>
                <th className="text-right">Margen %</th>
                <th className="text-right">Facturas</th>
                <th className="text-right">Clientes</th>
                <th className="text-right">Ticket prom.</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {data.por_marca.map(m => (
                <tr key={m.marca_id} className="border-t border-white/[0.04]">
                  <td className="py-1.5">{m.nombre}</td>
                  <td className="text-right">{m.cantidad.toLocaleString('es-CL')}</td>
                  <td className="text-right">{fmt(m.neto)}</td>
                  <td className="text-right">{fmt(m.ganancia)}</td>
                  <td className="text-right">{m.margen_pct.toFixed(1)}%</td>
                  <td className="text-right">{m.num_facturas}</td>
                  <td className="text-right">{m.num_clientes}</td>
                  <td className="text-right">{fmt(m.ticket_promedio)}</td>
                </tr>
              ))}
              {data.sin_marca.neto > 0 && (
                <tr className="border-t border-white/[0.04] text-gray-500 italic">
                  <td className="py-1.5">(Sin marca)</td>
                  <td className="text-right">{data.sin_marca.cantidad.toLocaleString('es-CL')}</td>
                  <td className="text-right">{fmt(data.sin_marca.neto)}</td>
                  <td className="text-right">{fmt(data.sin_marca.ganancia)}</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                  <td className="text-right">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </SectionCard>
      )}

      {subtab === 'marca_cliente' && (
        <SectionCard>
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left py-1.5">Marca</th>
                <th className="text-left">Cliente</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Neto</th>
                <th className="text-right">Ganancia</th>
                <th className="text-right">Margen %</th>
                <th className="text-right">Facturas</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {data.por_marca_cliente.map(r => (
                <tr key={`${r.marca_id}-${r.cliente_id}`} className="border-t border-white/[0.04]">
                  <td className="py-1.5">{r.marca_nombre}</td>
                  <td>{r.cliente_nombre}</td>
                  <td className="text-right">{r.cantidad.toLocaleString('es-CL')}</td>
                  <td className="text-right">{fmt(r.neto)}</td>
                  <td className="text-right">{fmt(r.ganancia)}</td>
                  <td className="text-right">{r.margen_pct.toFixed(1)}%</td>
                  <td className="text-right">{r.num_facturas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={() => exportFile('por-marca', 'excel', dateFrom, dateTo, extraQuery)}
          className="bg-gray-900 border border-white/[0.1] text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-800"
        >↓ Excel</button>
        <button
          onClick={() => exportFile('por-marca', 'csv', dateFrom, dateTo, extraQuery)}
          className="bg-gray-900 border border-white/[0.1] text-gray-300 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-800"
        >↓ CSV</button>
      </div>
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

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Cargando...</div>
  if (!data) return <div className="text-red-400 text-sm py-8 text-center">Error al cargar datos</div>

  const estadoColor: Record<string, string> = {
    aceptada: 'text-emerald-400',
    rechazada: 'text-red-400',
    pendiente: 'text-amber-400',
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Total emitidos" value={data.kpis.total_emitidos} />
        <KpiCard label="Aceptadas" value={data.kpis.aceptadas} />
        <KpiCard label="Rechazadas" value={data.kpis.rechazadas} />
        <KpiCard label="Pendientes" value={data.kpis.pendientes} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <SectionCard title="Por tipo de documento">
          <div className="space-y-1.5">
            {data.por_tipo.map(t => (
              <div key={t.tipo} className="flex justify-between items-center text-xs">
                <span className="text-gray-300">{t.label}</span>
                <span className="text-gray-500">{t.count} ({t.aceptadas} acept.)</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title="Emisiones">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-600 border-b border-white/[0.06]">
                    <th className="text-left pb-1.5 pr-2">Tipo</th>
                    <th className="text-left pb-1.5 pr-2">Folio</th>
                    <th className="text-left pb-1.5 pr-2">Estado</th>
                    <th className="text-right pb-1.5 pr-2">Monto</th>
                    <th className="text-left pb-1.5">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {data.emisiones.map(e => (
                    <tr key={e.id} className="border-b border-white/[0.03]">
                      <td className="py-1 pr-2 text-gray-400">{e.tipo}</td>
                      <td className="py-1 pr-2 text-gray-300">{e.folio ?? '—'}</td>
                      <td className={`py-1 pr-2 font-medium ${estadoColor[e.estado] ?? 'text-gray-400'}`}>{e.estado}</td>
                      <td className="py-1 pr-2 text-gray-400 text-right">${e.monto_total.toLocaleString('es-CL')}</td>
                      <td className="py-1 text-gray-500">{e.created_at ? e.created_at.slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      </div>

      <ExportButtons tab="dte" dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'ventas' | 'cobranza' | 'inventario' | 'compras' | 'margenes' | 'por_marca' | 'dte'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'cobranza', label: 'Cobranza' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'compras', label: 'Compras' },
  { id: 'margenes', label: 'Márgenes' },
  { id: 'por_marca', label: 'Por Marca' },
  { id: 'dte', label: 'DTE' },
]

const PRESETS = [
  { id: 'este_mes', label: 'Este mes' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'este_anio', label: 'Este año' },
  { id: 'ultimos_3_meses', label: 'Últimos 3 meses' },
  { id: 'personalizado', label: 'Rango personalizado' },
]

export default function Reportes() {
  const [activeTab, setActiveTab] = useState<Tab>('ventas')
  const [preset, setPreset] = useState('este_mes')
  const defaultDates = getPresetDates('este_mes')
  const [dateFrom, setDateFrom] = useState(defaultDates.from)
  const [dateTo, setDateTo] = useState(defaultDates.to)

  function handlePresetChange(p: string) {
    setPreset(p)
    if (p !== 'personalizado') {
      const { from, to } = getPresetDates(p)
      setDateFrom(from)
      setDateTo(to)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1120] text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Reportes</h1>
            <p className="text-xs text-gray-500 mt-0.5">Análisis y métricas del negocio</p>
          </div>

          {/* Date range controls */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={preset}
              onChange={e => handlePresetChange(e.target.value)}
              className="bg-gray-900 border border-white/[0.1] text-gray-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400/50"
            >
              {PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            {preset === 'personalizado' && (
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="bg-gray-900 border border-white/[0.1] text-gray-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400/50"
                />
                <span className="text-gray-600 text-xs">→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="bg-gray-900 border border-white/[0.1] text-gray-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400/50"
                />
              </>
            )}

            {preset !== 'personalizado' && (
              <span className="text-xs text-gray-600">{dateFrom} → {dateTo}</span>
            )}
          </div>
        </div>

        {/* Tab row */}
        <div className="flex gap-1 border-b border-white/[0.06] mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'border-b-2 border-amber-400 text-amber-400'
                  : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'ventas' && <VentasTab dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === 'cobranza' && <CobranzaTab dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === 'inventario' && <InventarioTab dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === 'compras' && <ComprasTab dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === 'margenes' && <MargenesTab dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === 'por_marca' && <MarcaTab dateFrom={dateFrom} dateTo={dateTo} />}
        {activeTab === 'dte' && <DteTab dateFrom={dateFrom} dateTo={dateTo} />}

      </div>
    </div>
  )
}
