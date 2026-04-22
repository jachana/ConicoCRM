import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { EmpresaProductoLine } from '../types'
import { EMPRESA_PRODUCTO_COLS } from '../lib/columnDefs'
import EmpresaExportPanel from './EmpresaExportPanel'

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

  const exportBaseUrl = `/api/empresas/${empresaId}/export/productos?${(() => {
    const p = new URLSearchParams({ q })
    if (fechaDesde) p.set('fecha_desde', fechaDesde)
    if (fechaHasta) p.set('fecha_hasta', fechaHasta)
    return p.toString()
  })()}`

  const totalNeto = useMemo(() => lineas.reduce((s, l) => s + l.total_neto, 0), [lineas])
  const facturaCount = useMemo(() => new Set(lineas.map(l => l.factura_id)).size, [lineas])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-500 ml-1">↕</span>
    return <span className="text-sky-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const HEADERS: { field: SortField; label: string }[] = [
    { field: 'fecha',       label: 'Fecha' },
    { field: 'sku',         label: 'SKU' },
    { field: 'descripcion', label: 'Descripción' },
    { field: 'cantidad',    label: 'Cantidad' },
    { field: 'precio_unit', label: 'Precio Unit.' },
    { field: 'total_neto',  label: 'Total' },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar SKU o descripción..."
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 min-w-[200px]" />
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300" />
        <span className="text-gray-400 text-sm">→</span>
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300" />
        <button onClick={() => setShowExport(o => !o)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg transition-colors">
          ↓ Exportar
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : lineas.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center">Sin líneas de productos</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="text-sm w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap cursor-pointer hover:text-gray-900 dark:hover:text-white select-none"
                  onClick={() => toggleSort('fecha')}>
                  Fecha <SortIcon field="fecha" />
                </th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap text-sky-500">Nº Fac.</th>
                {HEADERS.filter(h => h.field !== 'fecha').map(({ field, label }) => (
                  <th key={field} onClick={() => toggleSort(field)}
                    className="text-left px-3 py-2 font-medium whitespace-nowrap cursor-pointer hover:text-gray-900 dark:hover:text-white select-none">
                    {label} <SortIcon field={field} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {lineas.map((l, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(l.fecha)}</td>
                  <td className="px-3 py-2 text-sky-500 font-mono text-xs whitespace-nowrap">
                    FAC-{String(l.factura_numero).padStart(4, '0')}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">{l.sku ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{l.descripcion}</td>
                  <td className="px-3 py-2 text-right font-num text-gray-700 dark:text-gray-300">{l.cantidad}</td>
                  <td className="px-3 py-2 text-right font-num text-gray-500 dark:text-gray-400">{fmtMoney(l.precio_unit)}</td>
                  <td className="px-3 py-2 text-right font-num font-semibold text-gray-900 dark:text-white">{fmtMoney(l.total_neto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {lineas.length > 0 && (
        <div className="flex justify-between text-xs text-gray-400 px-1">
          <span>{lineas.length} línea{lineas.length !== 1 ? 's' : ''} en {facturaCount} factura{facturaCount !== 1 ? 's' : ''}</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">Total: {fmtMoney(totalNeto)}</span>
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
