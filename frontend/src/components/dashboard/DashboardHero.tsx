import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Wallet,
  FileText,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useModulos } from '../../hooks/useModulos'
import { isModuloEnabled } from '../../lib/modulos'
import type { DashboardSummaryOut } from '../../types/dashboard'
import { cn } from '../../lib/cn'
import KpiDrilldownModal, { type KpiDrilldownKind } from './KpiDrilldownModal'

function formatCLP(n: number): string {
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
}

function formatCLPCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1_000) return `$ ${(n / 1_000).toFixed(0)}K`
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

function greeting(name: string): { text: string; emoji: string } {
  const h = new Date().getHours()
  const first = name.split(' ')[0]
  if (h < 6) return { text: `Trabajando hasta tarde, ${first}`, emoji: '🌙' }
  if (h < 12) return { text: `Buenos días, ${first}`, emoji: '☀️' }
  if (h < 19) return { text: `Buenas tardes, ${first}`, emoji: '👋' }
  return { text: `Buenas noches, ${first}`, emoji: '🌆' }
}

function pctDelta(current: number, prev: number): number | null {
  if (prev === 0) return current > 0 ? 100 : null
  return ((current - prev) / prev) * 100
}

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Minus size={12} /> —
      </span>
    )
  }
  const positive = delta > 0
  const flat = Math.abs(delta) < 0.5
  if (flat) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Minus size={12} /> 0%
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        positive
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-rose-600 dark:text-rose-400',
      )}
    >
      {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {Math.abs(delta).toFixed(0)}%
    </span>
  )
}

interface KPICardProps {
  label: string
  value: string
  hint?: string
  delta?: number | null
  icon: React.ReactNode
  accent: 'brand' | 'emerald' | 'amber' | 'rose'
  onClick?: () => void
}

const ACCENTS: Record<KPICardProps['accent'], string> = {
  brand:
    'from-brand-500/10 to-brand-500/0 border-brand-500/20 text-brand-700 dark:text-brand-300',
  emerald:
    'from-emerald-500/10 to-emerald-500/0 border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  amber:
    'from-amber-500/10 to-amber-500/0 border-amber-500/20 text-amber-700 dark:text-amber-300',
  rose:
    'from-rose-500/10 to-rose-500/0 border-rose-500/20 text-rose-700 dark:text-rose-300',
}

function KPICard({ label, value, hint, delta, icon, accent, onClick }: KPICardProps) {
  const inner = (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded-lg border bg-gradient-to-br px-3 py-2 transition-all text-left',
        'hover:shadow-md hover:-translate-y-0.5',
        ACCENTS[accent],
        'bg-white dark:bg-gray-900',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
          {label}
        </div>
        <div className={cn('flex h-5 w-5 items-center justify-center rounded shrink-0', ACCENTS[accent])}>
          {icon}
        </div>
      </div>
      <div className="mt-1 text-base md:text-lg font-bold text-gray-900 dark:text-gray-50 tabular-nums leading-tight">
        {value}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
        {hint && <span className="truncate">{hint}</span>}
        {delta !== undefined && <DeltaPill delta={delta} />}
      </div>
    </div>
  )
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="block h-full w-full text-left focus:outline-none focus:ring-2 focus:ring-brand-500/40 rounded-lg"
    >
      {inner}
    </button>
  ) : (
    inner
  )
}

interface DashboardHeroProps {
  userName: string
  presetName?: string
}

export default function DashboardHero({ userName, presetName }: DashboardHeroProps) {
  const [drilldown, setDrilldown] = useState<KpiDrilldownKind | null>(null)

  const { data, isLoading } = useQuery<DashboardSummaryOut>({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get('/api/dashboard/summary').then(r => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const { effective: modulos } = useModulos()
  const showFacturas = isModuloEnabled(modulos, 'facturas')
  const showNV = isModuloEnabled(modulos, 'notas_venta')
  const showInventario = isModuloEnabled(modulos, 'inventario')

  const g = greeting(userName || 'Hola')
  const today = new Date().toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const ventasDelta = data ? pctDelta(data.ventas_hoy, data.ventas_ayer) : null
  const mesDelta = data ? pctDelta(data.ventas_mes, data.ventas_mes_anterior) : null

  const visibleCount = [showFacturas, showFacturas, showNV, showInventario].filter(Boolean).length

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-gradient-to-br from-brand-500/5 via-transparent to-transparent dark:from-brand-500/[0.07] px-4 md:px-6 pt-4 pb-3">
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <span>{g.text}</span>
            <span aria-hidden className="text-base">{g.emoji}</span>
          </div>
          <div className="text-xs md:text-sm text-gray-500 dark:text-gray-400 capitalize">
            {today}
            {presetName && (
              <>
                <span className="mx-1.5 text-gray-300 dark:text-gray-700">·</span>
                <span>{presetName}</span>
              </>
            )}
          </div>
        </div>
        {isLoading && (
          <div className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            Cargando KPIs…
          </div>
        )}
      </div>

      {visibleCount > 0 && (
        <div
          className="grid gap-2 md:gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(visibleCount, 4)}, minmax(0, 1fr))` }}
        >
          {showFacturas && (
            <KPICard
              label="Ventas hoy"
              value={data ? formatCLPCompact(data.ventas_hoy) : '—'}
              hint={data ? `${data.ventas_hoy_count} venta${data.ventas_hoy_count === 1 ? '' : 's'}` : undefined}
              delta={ventasDelta}
              icon={<TrendingUp size={14} />}
              accent="brand"
              onClick={() => setDrilldown('hoy')}
            />
          )}
          {showFacturas && (
            <KPICard
              label="Ventas mes"
              value={data ? formatCLPCompact(data.ventas_mes) : '—'}
              hint={data ? `${data.ventas_mes_count} en total` : undefined}
              delta={mesDelta}
              icon={<Wallet size={14} />}
              accent="emerald"
              onClick={() => setDrilldown('mes')}
            />
          )}
          {showNV && (
            <KPICard
              label="Por cobrar"
              value={data ? `${data.nv_pendientes_count}` : '—'}
              hint={data ? formatCLP(data.nv_pendientes_monto) : undefined}
              icon={<FileText size={14} />}
              accent="amber"
              onClick={() => setDrilldown('cobrar')}
            />
          )}
          {showInventario && (
            <KPICard
              label="Stock crítico"
              value={data ? `${data.stock_critico_count}` : '—'}
              hint={
                data
                  ? data.stock_critico_count === 0
                    ? 'Todo OK'
                    : 'productos bajo mínimo'
                  : undefined
              }
              icon={<AlertTriangle size={14} />}
              accent={data && data.stock_critico_count > 0 ? 'rose' : 'emerald'}
              onClick={() => setDrilldown('stock')}
            />
          )}
        </div>
      )}
      <KpiDrilldownModal kind={drilldown} onClose={() => setDrilldown(null)} />
    </div>
  )
}
