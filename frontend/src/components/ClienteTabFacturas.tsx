import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { api } from '../lib/api'
import type { EmpresaFacturaItem } from '../types'
import {
  Button, Input, Badge, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
  Popover, PopoverTrigger, PopoverContent,
} from './ui'

const ESTADO_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  emitida: 'info',
  pagada:  'success',
  parcial: 'warning',
  anulada: 'danger',
}

type SortField = 'fecha' | 'numero' | 'total' | 'pendiente' | 'estado' | 'monto_pagado'

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

interface Props {
  clienteId: number
}

export default function ClienteTabFacturas({ clienteId }: Props) {
  const [estados, setEstados] = useState<string[]>([])
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const params = new URLSearchParams()
  estados.forEach(e => params.append('estado', e))
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  params.set('sort_by', sortField)
  params.set('sort_dir', sortDir)

  const { data: facturas = [], isLoading } = useQuery<EmpresaFacturaItem[]>({
    queryKey: ['cliente-facturas', clienteId, estados, fechaDesde, fechaHasta, sortField, sortDir],
    queryFn: () =>
      api.get(`/api/clientes/${clienteId}/facturas?${params.toString()}`).then(r => r.data),
  })

  const totalPendiente = useMemo(() => facturas.reduce((s, f) => s + f.pendiente, 0), [facturas])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-500 dark:text-gray-400 ml-1">↕</span>
    return <span className="text-brand-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const HEADERS: { field: SortField; label: string; align?: 'right' }[] = [
    { field: 'numero',       label: 'Nº' },
    { field: 'fecha',        label: 'Fecha' },
    { field: 'estado',       label: 'Estado' },
    { field: 'total',        label: 'Total',    align: 'right' },
    { field: 'monto_pagado', label: 'Pagado',   align: 'right' },
    { field: 'pendiente',    label: 'Pendiente', align: 'right' },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={estados.length > 0 ? 'primary' : 'outline'}
            >
              {estados.length > 0 ? `Estado (${estados.length})` : 'Estado'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-1">
            {(['emitida', 'pagada', 'parcial', 'anulada']).map(e => (
              <label key={e} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-sm text-gray-800 dark:text-gray-200 rounded capitalize">
                <input
                  type="checkbox"
                  checked={estados.includes(e)}
                  onChange={() => setEstados(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])}
                  className="rounded accent-brand-500"
                />
                {e}
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <Input type="date" size="sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-40" />
        <span className="text-gray-500 dark:text-gray-400 text-sm">→</span>
        <Input type="date" size="sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-40" />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : facturas.length === 0 ? (
        <EmptyState icon={<Inbox />} title="Sin facturas" description="No hay facturas que coincidan con los filtros." />
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <Table density="compact">
            <THead>
              <TR>
                {HEADERS.map(({ field, label, align }) => (
                  <TH
                    key={field}
                    onClick={() => toggleSort(field)}
                    className={`cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 select-none whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`}
                  >
                    {label}
                    <SortIndicator field={field} />
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {facturas.map(f => (
                <TR key={f.id}>
                  <TD className="font-num font-medium text-gray-900 dark:text-gray-100">FAC-{String(f.numero).padStart(4, '0')}</TD>
                  <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">{fmtDate(f.fecha)}</TD>
                  <TD>
                    <Badge variant={ESTADO_VARIANT[f.estado] ?? 'neutral'} showDot className="capitalize">{f.estado}</Badge>
                  </TD>
                  <TD className="text-right font-num text-gray-700 dark:text-gray-300">{fmtMoney(f.total)}</TD>
                  <TD className="text-right font-num text-success-600 dark:text-success-400">{fmtMoney(f.monto_pagado)}</TD>
                  <TD className={`text-right font-num font-semibold ${f.pendiente > 0 ? 'text-danger-600 dark:text-danger-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {f.pendiente > 0 ? fmtMoney(f.pendiente) : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {/* Footer */}
      {facturas.length > 0 && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
          <span>{facturas.length} factura{facturas.length !== 1 ? 's' : ''}</span>
          {totalPendiente > 0 && (
            <span className="text-danger-600 dark:text-danger-400 font-semibold font-num">
              Total pendiente: {fmtMoney(totalPendiente)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
