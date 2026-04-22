import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { api } from '../lib/api'
import type { EmpresaFacturaItem } from '../types'
import { EMPRESA_FACTURA_COLS } from '../lib/columnDefs'
import EmpresaExportPanel from './EmpresaExportPanel'

const ESTADO_BADGE: Record<string, string> = {
  emitida: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  pagada:  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  anulada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

type SortField = 'fecha' | 'numero' | 'total' | 'pendiente' | 'estado'

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

export default function EmpresaTabFacturas({ empresaId, empresaNombre }: Props) {
  const [estados, setEstados] = useState<string[]>([])
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [sortField, setSortField] = useState<SortField>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showExport, setShowExport] = useState(false)
  const [estadoPillOpen, setEstadoPillOpen] = useState(false)

  const params = new URLSearchParams()
  estados.forEach(e => params.append('estado', e))
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  params.set('sort_by', sortField)
  params.set('sort_dir', sortDir)

  const { data: facturas = [], isLoading } = useQuery<EmpresaFacturaItem[]>({
    queryKey: ['empresa-facturas', empresaId, estados, fechaDesde, fechaHasta, sortField, sortDir],
    queryFn: () =>
      api.get(`/api/empresas/${empresaId}/facturas?${params.toString()}`).then(r => r.data),
  })

  const exportBaseUrl = `/api/empresas/${empresaId}/export/facturas?${(() => {
    const p = new URLSearchParams()
    estados.forEach(e => p.append('estado', e))
    if (fechaDesde) p.set('fecha_desde', fechaDesde)
    if (fechaHasta) p.set('fecha_hasta', fechaHasta)
    return p.toString()
  })()}`

  const totalPendiente = useMemo(() => facturas.reduce((s, f) => s + f.pendiente, 0), [facturas])

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-500 ml-1">↕</span>
    return <span className="text-sky-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {/* Estado pill */}
        <div className="relative">
          <button onClick={() => setEstadoPillOpen(o => !o)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm transition-colors ${estados.length > 0 ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
            {estados.length > 0 ? `Estado (${estados.length})` : 'Estado'}
            <ChevronDown size={12} className={`transition-transform ${estadoPillOpen ? 'rotate-180' : ''}`} />
          </button>
          {estadoPillOpen && (
            <div className="absolute top-full left-0 mt-1.5 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-2 min-w-[150px]">
              {['emitida', 'pagada', 'parcial', 'anulada'].map(e => (
                <label key={e} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-800 dark:text-gray-200">
                  <input type="checkbox" checked={estados.includes(e)}
                    onChange={() => setEstados(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])}
                    className="rounded" />
                  {e}
                </label>
              ))}
            </div>
          )}
        </div>
        {/* Date range */}
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-gray-700 dark:text-gray-300" />
        <span className="text-gray-400 text-sm">→</span>
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-gray-700 dark:text-gray-300" />
        <button onClick={() => setShowExport(o => !o)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg transition-colors">
          ↓ Exportar
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">Cargando...</div>
      ) : facturas.length === 0 ? (
        <div className="text-gray-400 text-sm py-8 text-center">Sin facturas</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="text-sm w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              <tr>
                {(['numero', 'fecha', 'estado', 'total', 'monto_pagado', 'pendiente'] as SortField[]).map(field => (
                  <th key={field} onClick={() => toggleSort(field as SortField)}
                    className="text-left px-3 py-2 font-medium whitespace-nowrap cursor-pointer hover:text-gray-900 dark:hover:text-white select-none">
                    {{ numero: 'Nº', fecha: 'Fecha', estado: 'Estado', total: 'Total', monto_pagado: 'Pagado', pendiente: 'Pendiente' }[field]}
                    <SortIcon field={field as SortField} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {facturas.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">FAC-{String(f.numero).padStart(4, '0')}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(f.fecha)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[f.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {f.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-num text-gray-700 dark:text-gray-300">{fmtMoney(f.total)}</td>
                  <td className="px-3 py-2 text-right font-num text-green-600 dark:text-green-400">{fmtMoney(f.monto_pagado)}</td>
                  <td className={`px-3 py-2 text-right font-num font-semibold ${f.pendiente > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {f.pendiente > 0 ? fmtMoney(f.pendiente) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      {facturas.length > 0 && (
        <div className="flex justify-between text-xs text-gray-400 px-1">
          <span>{facturas.length} factura{facturas.length !== 1 ? 's' : ''}</span>
          {totalPendiente > 0 && (
            <span className="text-red-500 font-semibold">Total pendiente: {fmtMoney(totalPendiente)}</span>
          )}
        </div>
      )}

      {/* Export panel */}
      {showExport && (
        <EmpresaExportPanel
          rows={facturas}
          colDefs={EMPRESA_FACTURA_COLS}
          isLoading={isLoading}
          exportBaseUrl={exportBaseUrl}
          storageKey={`empresa-facturas-cols-${empresaId}`}
          filename={`facturas-${empresaNombre.replace(/\s+/g, '-')}.xlsx`}
        />
      )}
    </div>
  )
}
