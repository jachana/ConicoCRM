import { openPdf } from '../lib/pdf'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Eye, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import type { NotaVenta } from '../types'

const ESTADO_LABELS: Record<string, string> = {
  pendiente:  'Pendiente',
  despachada: 'Despachada',
  entregada:  'Entregada',
  pagada:     'Pagada',
  cancelada:  'Cancelada',
}

const ESTADO_COLORS: Record<string, string> = {
  pendiente:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  despachada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  entregada:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  pagada:     'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelada:  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export default function NotaVentas() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [estado, setEstado] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)

  const { data: nvs = [], isLoading } = useQuery<NotaVenta[]>({
    queryKey: ['nota_ventas', estado, fechaDesde, fechaHasta],
    queryFn: () => api.get(`/api/nota_ventas/?${params.toString()}`).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/nota_ventas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nota_ventas'] }); setDeleteId(null); setDeleteError('') },
    onError: (err: any) => setDeleteError(err?.response?.data?.detail || 'Error al eliminar'),
  })

  function fmtMoney(n: number) {
    return `$ ${Math.round(n).toLocaleString('es-CL')}`
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Notas de Venta</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('/api/nota_ventas/export/excel', '_blank')}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Excel
          </button>
          <button
            onClick={() => navigate('/notas-venta/nueva')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nueva NV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={estado}
          onChange={e => setEstado(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
      </div>

      {isLoading ? (
        <div className="text-gray-500 py-8 text-center">Cargando...</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                {['Nº', 'Fecha', 'Cliente', 'Contacto', 'Total', 'Estado', 'Encargado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {nvs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin notas de venta</td></tr>
              )}
              {nvs.map(nv => (
                <tr key={nv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    NV-{String(nv.numero).padStart(5, '0')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(nv.fecha + 'T00:00:00').toLocaleDateString('es-CL')}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{nv.cliente?.nombre ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{nv.contacto ?? '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                    {fmtMoney(nv.total)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[nv.estado] ?? ''}`}>
                      {ESTADO_LABELS[nv.estado] ?? nv.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{nv.vendedor?.name ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/notas-venta/${nv.id}`)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="Ver/Editar"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => openPdf(`/api/nota_ventas/${nv.id}/pdf`)}
                        className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
                        title="PDF"
                      >
                        <FileText size={15} />
                      </button>
                      {nv.estado === 'pendiente' && (
                        <button
                          onClick={() => { setDeleteId(nv.id); setDeleteError('') }}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar nota de venta?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Esta acción no se puede deshacer.</p>
            {deleteError && <p className="text-sm text-red-500 mb-3">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDeleteId(null); setDeleteError('') }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Cancelar
              </button>
              <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
