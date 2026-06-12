import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import type { VentaDocItem } from '../types'
import EntityLink from './EntityLink'
import {
  Button, Input, Badge, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
} from './ui'

function startOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

type BadgeVariant = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

const COTIZACION_ESTADO_VARIANT: Record<string, BadgeVariant> = {
  no_definido: 'neutral',
  abierta: 'info',
  aprobada: 'success',
  cerrada_fv: 'success',
  rechazada: 'danger',
}

const COTIZACION_ESTADO_LABELS: Record<string, string> = {
  no_definido: 'Sin definir',
  abierta: 'Abierta',
  aprobada: 'Aprobada',
  cerrada_fv: 'Cerrada (FV)',
  rechazada: 'Rechazada',
}

const NV_ESTADO_VARIANT: Record<string, BadgeVariant> = {
  pendiente:  'neutral',
  despachada: 'info',
  entregada:  'warning',
  pagada:     'success',
  cancelada:  'danger',
  facturada:  'success',
}

const NV_ESTADO_LABELS: Record<string, string> = {
  pendiente:  'Pendiente',
  despachada: 'Despachada',
  entregada:  'Entregada',
  pagada:     'Pagada',
  cancelada:  'Cancelada',
  facturada:  'Facturada',
}

interface Props {
  scope: 'empresas' | 'clientes'
  entityId: number
}

interface SectionProps {
  title: string
  docs: VentaDocItem[]
  isLoading: boolean
  emptyTitle: string
  renderNumero: (doc: VentaDocItem) => React.ReactNode
  estadoVariant: Record<string, BadgeVariant>
  estadoLabels: Record<string, string>
  countLabel: (n: number) => string
}

function VentaSection({ title, docs, isLoading, emptyTitle, renderNumero, estadoVariant, estadoLabels, countLabel }: SectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
        <FileText size={14} className="text-gray-500 dark:text-gray-400" />
        {title}
      </h3>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : docs.length === 0 ? (
        <EmptyState icon={<Inbox />} title={emptyTitle} description="No hay documentos que coincidan con los filtros." />
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <Table density="compact">
            <THead>
              <TR>
                <TH>Nº</TH>
                <TH>Fecha</TH>
                <TH>Estado</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {docs.map(d => (
                <TR key={d.id}>
                  <TD className="font-num font-medium">{renderNumero(d)}</TD>
                  <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">{fmtDate(d.fecha)}</TD>
                  <TD>
                    <Badge variant={estadoVariant[d.estado] ?? 'neutral'} showDot>
                      {estadoLabels[d.estado] ?? d.estado}
                    </Badge>
                  </TD>
                  <TD className="text-right font-num text-gray-700 dark:text-gray-300">{fmtMoney(d.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      {docs.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 px-1">
          {countLabel(docs.length)}
        </div>
      )}
    </section>
  )
}

export default function VentasTab({ scope, entityId }: Props) {
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const params = new URLSearchParams()
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  const qs = params.toString()
  const suffix = qs ? `?${qs}` : ''

  const { data: cotizaciones = [], isLoading: loadingCot } = useQuery<VentaDocItem[]>({
    queryKey: [`${scope}-cotizaciones`, entityId, fechaDesde, fechaHasta],
    queryFn: () =>
      api.get(`/api/${scope}/${entityId}/cotizaciones${suffix}`).then(r => r.data),
  })

  const { data: notasVenta = [], isLoading: loadingNv } = useQuery<VentaDocItem[]>({
    queryKey: [`${scope}-nota-ventas`, entityId, fechaDesde, fechaHasta],
    queryFn: () =>
      api.get(`/api/${scope}/${entityId}/nota-ventas${suffix}`).then(r => r.data),
  })

  function applyQuickDate(from: string) {
    if (fechaDesde === from) {
      setFechaDesde('')
    } else {
      setFechaDesde(from)
      setFechaHasta('')
    }
  }

  const mesStart = startOfMonth()
  const yearStart = startOfYear()

  return (
    <div className="flex flex-col gap-4">
      {/* Quick filter chips */}
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filtros rápidos">
        <Button
          size="sm"
          variant={fechaDesde === mesStart ? 'primary' : 'outline'}
          onClick={() => applyQuickDate(mesStart)}
          aria-pressed={fechaDesde === mesStart}
        >
          Este mes
        </Button>
        <Button
          size="sm"
          variant={fechaDesde === yearStart ? 'primary' : 'outline'}
          onClick={() => applyQuickDate(yearStart)}
          aria-pressed={fechaDesde === yearStart}
        >
          Este año
        </Button>
      </div>

      {/* Date filters (shared by both sections) */}
      <div className="flex gap-2 flex-wrap items-center">
        <Input type="date" size="sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-40" />
        <span className="text-gray-500 dark:text-gray-400 text-sm">→</span>
        <Input type="date" size="sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-40" />
      </div>

      <VentaSection
        title="Cotizaciones"
        docs={cotizaciones}
        isLoading={loadingCot}
        emptyTitle="Sin cotizaciones"
        renderNumero={c => (
          <EntityLink kind="cotizacion" id={c.id}>
            COT-{String(c.numero ?? c.id).padStart(4, '0')}
          </EntityLink>
        )}
        estadoVariant={COTIZACION_ESTADO_VARIANT}
        estadoLabels={COTIZACION_ESTADO_LABELS}
        countLabel={n => (n === 1 ? '1 cotización' : `${n} cotizaciones`)}
      />

      <VentaSection
        title="Notas de Venta"
        docs={notasVenta}
        isLoading={loadingNv}
        emptyTitle="Sin notas de venta"
        renderNumero={nv => (
          <EntityLink kind="nv" id={nv.id}>
            {nv.numero != null ? `NV-${String(nv.numero).padStart(4, '0')}` : 'NV s/n'}
          </EntityLink>
        )}
        estadoVariant={NV_ESTADO_VARIANT}
        estadoLabels={NV_ESTADO_LABELS}
        countLabel={n => `${n} nota${n !== 1 ? 's' : ''} de venta`}
      />
    </div>
  )
}
