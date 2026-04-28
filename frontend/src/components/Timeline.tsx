import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  FileText,
  ShoppingCart,
  Receipt,
  RotateCcw,
  Plus,
  CreditCard,
  CheckSquare,
  Truck,
  Tag,
  Inbox,
} from 'lucide-react'
import { getClienteTimeline, getEmpresaTimeline } from '../api/timeline'
import type { TimelineTipo, TimelineEvent } from '../api/timeline'
import { Button, Badge, Card, CardContent, EmptyState, Skeleton } from './ui'
import { cn } from '../lib/cn'

// ─── Icon & variant maps ───────────────────────────────────────────────────────

const TIPO_ICON: Record<TimelineTipo, React.ReactNode> = {
  cotizacion:    <FileText size={16} />,
  nota_venta:    <ShoppingCart size={16} />,
  factura:       <Receipt size={16} />,
  nota_credito:  <RotateCcw size={16} />,
  nota_debito:   <Plus size={16} />,
  pago:          <CreditCard size={16} />,
  tarea:         <CheckSquare size={16} />,
  guia_despacho: <Truck size={16} />,
  boleta:        <Tag size={16} />,
}

type BadgeVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'brand'

const TIPO_VARIANT: Record<TimelineTipo, BadgeVariant> = {
  cotizacion:    'info',
  nota_venta:    'brand',
  factura:       'success',
  nota_credito:  'danger',
  nota_debito:   'warning',
  pago:          'success',
  tarea:         'neutral',
  guia_despacho: 'info',
  boleta:        'brand',
}

const ESTADO_VARIANT: Record<string, BadgeVariant> = {
  emitida:    'info',
  pagada:     'success',
  parcial:    'warning',
  anulada:    'danger',
  pendiente:  'warning',
  hecha:      'success',
  descartada: 'neutral',
  aprobada:   'success',
  rechazada:  'danger',
  en_proceso: 'brand',
}

// ─── Filter pill definitions ───────────────────────────────────────────────────

const FILTER_PILLS: { tipo: TimelineTipo; label: string }[] = [
  { tipo: 'cotizacion',    label: 'Cotización' },
  { tipo: 'nota_venta',    label: 'NV' },
  { tipo: 'factura',       label: 'Factura' },
  { tipo: 'nota_credito',  label: 'NC' },
  { tipo: 'nota_debito',   label: 'ND' },
  { tipo: 'pago',          label: 'Pago' },
  { tipo: 'tarea',         label: 'Tarea' },
  { tipo: 'guia_despacho', label: 'Guía' },
  { tipo: 'boleta',        label: 'Boleta' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00')
  if (isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMoney(monto: string) {
  const n = parseFloat(monto)
  if (isNaN(n)) return monto
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div
      data-testid="timeline-skeleton-row"
      className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
    >
      <Skeleton shape="circle" className="size-8 flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-1.5">
        <Skeleton shape="text" className="w-2/5" />
        <Skeleton shape="text" className="w-1/4 h-3" />
      </div>
      <Skeleton shape="text" className="w-20" />
    </div>
  )
}

// ─── Single event row ─────────────────────────────────────────────────────────

function EventRow({ item }: { item: TimelineEvent }) {
  const variant = TIPO_VARIANT[item.tipo]

  return (
    <Link
      to={item.link}
      className={cn(
        'flex items-center gap-3 px-4 py-3',
        'border-b border-gray-100 dark:border-gray-800 last:border-0',
        'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
        'transition-colors duration-100',
      )}
    >
      {/* Icon */}
      <span
        className={cn(
          'flex-shrink-0 flex items-center justify-center size-8 rounded-full',
          variant === 'info'    && 'bg-info-100 text-info-700 dark:bg-info-500/15 dark:text-info-300',
          variant === 'success' && 'bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300',
          variant === 'warning' && 'bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300',
          variant === 'danger'  && 'bg-danger-100 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300',
          variant === 'brand'   && 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
          variant === 'neutral' && 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        )}
      >
        {TIPO_ICON[item.tipo]}
      </span>

      {/* Center content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {item.titulo}
        </p>
        {item.subtitulo && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.subtitulo}</p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{fmtDate(item.fecha)}</p>
      </div>

      {/* Right: monto + estado */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        {item.monto != null && (
          <span className="font-num text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
            {fmtMoney(item.monto)}
          </span>
        )}
        {item.estado != null && (
          <Badge
            variant={ESTADO_VARIANT[item.estado] ?? 'neutral'}
            size="sm"
            className="capitalize"
          >
            {item.estado.replace(/_/g, ' ')}
          </Badge>
        )}
      </div>
    </Link>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface TimelineProps {
  scope: 'cliente' | 'empresa'
  entityId: number
  pageSize?: number
}

export default function Timeline({ scope, entityId, pageSize = 25 }: TimelineProps) {
  const [activeTipos, setActiveTipos] = useState<TimelineTipo[]>([])

  // tipos to send: empty = all
  const tiposParam = activeTipos.length > 0 ? activeTipos : undefined

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['timeline', scope, entityId, tiposParam],
    queryFn: ({ pageParam = 0 }) => {
      const fetchFn = scope === 'cliente' ? getClienteTimeline : getEmpresaTimeline
      return fetchFn(entityId, { tipos: tiposParam, limit: pageSize, offset: pageParam as number })
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled: !!entityId,
  })

  const items = data?.pages.flatMap(p => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  function toggleTipo(tipo: TimelineTipo) {
    setActiveTipos(prev =>
      prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo],
    )
  }

  function clearFilters() {
    setActiveTipos([])
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
        {FILTER_PILLS.map(({ tipo, label }) => {
          const active = activeTipos.includes(tipo)
          return (
            <Button
              key={tipo}
              size="xs"
              variant={active ? 'primary' : 'outline'}
              onClick={() => toggleTipo(tipo)}
              aria-pressed={active}
            >
              {label}
            </Button>
          )
        })}
        {activeTipos.length > 0 && (
          <Button size="xs" variant="ghost" onClick={clearFilters}>
            Limpiar
          </Button>
        )}
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : isError ? (
            <div
              role="alert"
              className="m-4 px-4 py-3 text-sm rounded-lg bg-danger-50 dark:bg-danger-900/20 text-danger-700 dark:text-danger-300 border border-danger-200 dark:border-danger-800"
            >
              Error al cargar el historial de actividad.
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={<Inbox />} title="Sin actividad registrada" />
          ) : (
            <div>
              {items.map(item => (
                <EventRow key={`${item.tipo}-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </CardContent>

        {/* Load more */}
        {(hasNextPage || isFetchingNextPage) && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Cargando...' : 'Cargar más'}
            </Button>
          </div>
        )}
      </Card>

      {/* Hidden total for tests / a11y */}
      {total > 0 && (
        <p className="sr-only" aria-live="polite">
          {items.length} de {total} eventos
        </p>
      )}
    </div>
  )
}
