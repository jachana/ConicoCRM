import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Inbox, Search } from 'lucide-react'
import { api } from '../lib/api'
import type { EmpresaProductoLine } from '../types'
import { EMPRESA_PRODUCTO_COLS } from '../lib/columnDefs'
import EmpresaExportPanel from './EmpresaExportPanel'
import {
  Button, Input, EmptyState, Skeleton,
  Table, THead, TBody, TR, TH, TD,
} from './ui'

type SortField = 'fecha' | 'sku' | 'descripcion' | 'cantidad' | 'precio_unit' | 'total_neto'

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

interface Props {
  empresaId: number
  empresaNombre: string
}

export default function EmpresaTabProductos({ empresaId, empresaNombre }: Props) {
  const [q, setQ] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showExport, setShowExport] = useState(false)

  const params = new URLSearchParams({ q, sort_by: sortField, sort_dir: sortDir })
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)

  const { data: lineas = [], isLoading } = useQuery<EmpresaProductoLine[]>({
    queryKey: ['empresa-productos', empresaId, q, fechaDesde, fechaHasta, sortField, sortDir],
    queryFn: () =>
      api.get(`/api/empresas/${empresaId}/productos?${params.toString()}`).then(r => r.data),
  })

  const exportBaseUrl = (() => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (fechaDesde) p.set('fecha_desde', fechaDesde)
    if (fechaHasta) p.set('fecha_hasta', fechaHasta)
    const qs = p.toString()
    return `/api/empresas/${empresaId}/export/productos${qs ? '?' + qs : ''}`
  })()

  const totalNeto = useMemo(() => lineas.reduce((s, l) => s + l.total_neto, 0), [lineas])
  const facturaCount = useMemo(() => new Set(lineas.map(l => l.factura_id)).size, [lineas])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-400 ml-1">↕</span>
    return <span className="text-brand-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const HEADERS: { field: SortField; label: string; align?: 'right' }[] = [
    { field: 'fecha',       label: 'Fecha' },
    { field: 'sku',         label: 'SKU' },
    { field: 'descripcion', label: 'Descripción' },
    { field: 'cantidad',    label: 'Cantidad',    align: 'right' },
    { field: 'precio_unit', label: 'Precio Unit.', align: 'right' },
    { field: 'total_neto',  label: 'Total',       align: 'right' },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Input
          size="sm"
          leftAddon={<Search />}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar SKU o descripción..."
          className="min-w-[220px]"
        />
        <Input type="date" size="sm" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-40" />
        <span className="text-gray-400 text-sm">→</span>
        <Input type="date" size="sm" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-40" />
        <Button
          size="sm"
          variant="outline"
          leftIcon={<Download />}
          onClick={() => setShowExport(o => !o)}
          className="ml-auto"
        >
          Exportar
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : lineas.length === 0 ? (
        <EmptyState icon={<Inbox />} title="Sin líneas de productos" description="No hay líneas que coincidan con los filtros." />
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <Table density="compact">
            <THead>
              <TR>
                <TH onClick={() => toggleSort('fecha')} className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 select-none whitespace-nowrap">
                  Fecha <SortIndicator field="fecha" />
                </TH>
                <TH className="whitespace-nowrap text-brand-600 dark:text-brand-400">Nº Fac.</TH>
                {HEADERS.filter(h => h.field !== 'fecha').map(({ field, label, align }) => (
                  <TH
                    key={field}
                    onClick={() => toggleSort(field)}
                    className={`cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 select-none whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`}
                  >
                    {label} <SortIndicator field={field} />
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {lineas.map((l, i) => (
                <TR key={i}>
                  <TD className="text-gray-500 dark:text-gray-400 whitespace-nowrap font-num">{fmtDate(l.fecha)}</TD>
                  <TD className="text-brand-600 dark:text-brand-400 font-num text-xs whitespace-nowrap">
                    FAC-{String(l.factura_numero).padStart(4, '0')}
                  </TD>
                  <TD className="font-num text-xs text-gray-500 dark:text-gray-400">{l.sku ?? '—'}</TD>
                  <TD className="text-gray-700 dark:text-gray-300">{l.descripcion}</TD>
                  <TD className="text-right font-num text-gray-700 dark:text-gray-300">{l.cantidad}</TD>
                  <TD className="text-right font-num text-gray-500 dark:text-gray-400">{fmtMoney(l.precio_unit)}</TD>
                  <TD className="text-right font-num font-semibold text-gray-900 dark:text-gray-100">{fmtMoney(l.total_neto)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {/* Footer */}
      {lineas.length > 0 && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
          <span>{lineas.length} línea{lineas.length !== 1 ? 's' : ''} en {facturaCount} factura{facturaCount !== 1 ? 's' : ''}</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300 font-num">Total: {fmtMoney(totalNeto)}</span>
        </div>
      )}

      {/* Export panel */}
      {showExport && (
        <EmpresaExportPanel
          rows={lineas}
          colDefs={EMPRESA_PRODUCTO_COLS}
          isLoading={isLoading}
          exportBaseUrl={exportBaseUrl}
          storageKey={`empresa-productos-cols-${empresaId}`}
          filename={`productos-${empresaNombre.replace(/\s+/g, '-')}.xlsx`}
        />
      )}
    </div>
  )
}
