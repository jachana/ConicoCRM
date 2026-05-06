import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { api } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import type { KpisOut, SparklinePoint } from './types'

// ── helpers ─────────────────────────────────────────────────────────────────

function formatCLPCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1_000) return `$ ${(n / 1_000).toFixed(0)}K`
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-gray-400">—</span>
  const pos = delta > 0
  return (
    <span className={`text-xs font-medium ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      {pos ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
    </span>
  )
}

const ACCENTS = {
  brand:   'from-brand-500/10 to-brand-500/0 border-brand-500/20 text-brand-700 dark:text-brand-300',
  emerald: 'from-emerald-500/10 to-emerald-500/0 border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  amber:   'from-amber-500/10 to-amber-500/0 border-amber-500/20 text-amber-700 dark:text-amber-300',
  rose:    'from-rose-500/10 to-rose-500/0 border-rose-500/20 text-rose-700 dark:text-rose-300',
} as const

type Accent = keyof typeof ACCENTS

function TileShell({
  accent,
  children,
}: {
  accent: Accent
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded-xl border bg-gradient-to-br p-3 md:p-4 transition-all',
        'hover:shadow-md hover:-translate-y-0.5',
        'bg-white dark:bg-gray-900',
        ACCENTS[accent],
      )}
    >
      {children}
    </div>
  )
}

// ── Tile 1: Ventas del mes ────────────────────────────────────────────────────

function SparkTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded bg-gray-900 px-2 py-1 text-xs text-white shadow">
      {formatCLPCompact(payload[0].value)}
    </div>
  )
}

function VentasTile({ ventas }: { ventas: KpisOut['ventas'] }) {
  return (
    <TileShell accent="brand">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        Ventas del mes
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-50 tabular-nums">
        {formatCLPCompact(ventas.total)}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <DeltaPill delta={ventas.delta_pct} />
        <span className="text-xs text-gray-500 dark:text-gray-400">{ventas.count} documentos</span>
      </div>
      {ventas.sparkline.length > 0 && (
        <div className="mt-2 -mx-1">
          <ResponsiveContainer width="100%" height={50}>
            <AreaChart data={ventas.sparkline} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id="kpi-ventas-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="monto"
                stroke="#6366f1"
                strokeWidth={1.5}
                fill="url(#kpi-ventas-fill)"
                dot={false}
                isAnimationActive={false}
              />
              <Tooltip
                content={<SparkTooltip />}
                cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '3 3' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </TileShell>
  )
}

// ── Tile 2: Top clientes ──────────────────────────────────────────────────────

function TopClientesTile({ top_clientes }: { top_clientes: KpisOut['top_clientes'] }) {
  const rows = top_clientes.slice(0, 5)
  return (
    <TileShell accent="emerald">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
        Top clientes (mes)
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Sin datos</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((c, i) => (
            <li key={c.nombre} className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-400 dark:text-gray-500 w-4 shrink-0">{i + 1}.</span>
              <span
                className="flex-1 truncate text-gray-700 dark:text-gray-200"
                title={c.nombre}
              >
                {c.nombre.length > 22 ? c.nombre.slice(0, 20) + '…' : c.nombre}
              </span>
              <span className="tabular-nums text-gray-600 dark:text-gray-300 font-medium shrink-0">
                {formatCLPCompact(c.total)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </TileShell>
  )
}

// ── Tile 3: DTE Rechazo ───────────────────────────────────────────────────────

function DteRejectionTile({ dte_rejection }: { dte_rejection: KpisOut['dte_rejection'] }) {
  const { rate, rechazadas, emitidas } = dte_rejection
  const accent: Accent = rate >= 5 ? 'rose' : rate >= 2 ? 'amber' : 'emerald'

  return (
    <TileShell accent={accent}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        Tasa rechazo DTE
      </div>
      {emitidas === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Sin emisiones</p>
      ) : (
        <>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-50 tabular-nums">
            {rate.toFixed(1)}%
          </div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {rechazadas} rechazadas / {emitidas} emitidas
          </div>
        </>
      )}
    </TileShell>
  )
}

// ── Tile 4: AR Aging ──────────────────────────────────────────────────────────

interface AgingRow {
  label: string
  monto: number
  barColor: string
}

function ArAgingTile({ ar_aging }: { ar_aging: KpisOut['ar_aging'] }) {
  const total =
    ar_aging.d_0_30.monto +
    ar_aging.d_31_60.monto +
    ar_aging.d_61_90.monto +
    ar_aging.d_90_plus.monto

  const allZero = total === 0
  const accent: Accent = allZero ? 'emerald' : 'rose'

  const rows: AgingRow[] = [
    { label: '0–30d', monto: ar_aging.d_0_30.monto, barColor: 'bg-amber-300 dark:bg-amber-300' },
    { label: '31–60d', monto: ar_aging.d_31_60.monto, barColor: 'bg-amber-500 dark:bg-amber-400' },
    { label: '61–90d', monto: ar_aging.d_61_90.monto, barColor: 'bg-orange-500 dark:bg-orange-400' },
    { label: '+90d', monto: ar_aging.d_90_plus.monto, barColor: 'bg-rose-600 dark:bg-rose-500' },
  ]

  const maxMonto = Math.max(...rows.map(r => r.monto), 1)

  return (
    <TileShell accent={accent}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        Cartera vencida
      </div>
      {allZero ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
          Sin cartera vencida
        </p>
      ) : (
        <>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-50 tabular-nums mb-2">
            {formatCLPCompact(total)}
          </div>
          <div className="space-y-1.5">
            {rows.map(row => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="w-10 text-xs text-gray-500 dark:text-gray-400 shrink-0">{row.label}</span>
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', row.barColor)}
                    style={{ width: `${(row.monto / maxMonto) * 100}%` }}
                  />
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-gray-600 dark:text-gray-300 shrink-0">
                  {formatCLPCompact(row.monto)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </TileShell>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export default function KPITilesSection() {
  const periodo = currentPeriod()

  const { data, isLoading, isError } = useQuery<KpisOut>({
    queryKey: ['kpis', periodo],
    queryFn: () => api.get(`/api/reportes/kpis?periodo=${periodo}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return (
      <div className="px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 md:gap-3">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="h-28 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) return null

  return (
    <div className="px-4 md:px-6 py-3 border-b border-gray-200 dark:border-gray-800">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 md:gap-3">
        <VentasTile ventas={data.ventas} />
        <TopClientesTile top_clientes={data.top_clientes} />
        <DteRejectionTile dte_rejection={data.dte_rejection} />
        <ArAgingTile ar_aging={data.ar_aging} />
      </div>
    </div>
  )
}
