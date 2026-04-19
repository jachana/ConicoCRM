import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Mail, Trash2, Eye } from 'lucide-react'
import { api } from '../lib/api'
import type { Cotizacion } from '../types'

const ESTADO_LABELS: Record<string, string> = {
  no_definido: 'Sin definir',
  abierta: 'Abierta',
  cerrada_fv: 'Cerrada (FV)',
  rechazada: 'Rechazada',
}

const ESTADO_COLORS: Record<string, string> = {
  no_definido: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  abierta: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  cerrada_fv: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rechazada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export default function Cotizaciones() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [estado, setEstado] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)

  const { data: cotizaciones = [], isLoading } = useQuery<Cotizacion[]>({
    queryKey: ['cotizaciones', estado, fechaDesde, fechaHasta],
    queryFn: () => api.get(`/api/cotizaciones/?${params.toString()}`).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/cotizaciones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      setDeleteId(null)
      setDeleteError('')
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.detail || 'Error al eliminar')
    },
  })

  const emailMut = useMutation({
    mutationFn: (id: number) => api.post(`/api/cotizaciones/${id}/email`),
    onSuccess: () => {
      setEmailToast({ msg: 'Email enviado correctamente', ok: true })
      setTimeout(() => setEmailToast(null), 3500)
    },
    onError: (err: any) => {
      setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false })
      setTimeout(() => setEmailToast(null), 4000)
    },
  })

  function abrirPdf(id: number) {
    window.open(`/api/cotizaciones/${id}/pdf`, '_blank')
  }

  function fmtMoney(n: number) {
    return `$ ${Math.round(n).toLocaleString('es-CL')}`
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Cotizaciones</h1>
        <button
          onClick={() => navigate('/cotizaciones/nueva')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Nueva cotización
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={estado}
          onChange={e => setEstado(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">Todos los estados</option>
          <option value="no_definido">Sin definir</option>
          <option value="abierta">Abierta</option>
          <option value="cerrada_fv">Cerrada (FV)</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <input
          type="date"
          value={fechaDesde}
          onChange={e => setFechaDesde(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
        <input
          type="date"
          value={fechaHasta}
          onChange={e => setFechaHasta(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>

      {isLoading ? (
        <div className="text-gray-500 py-8 text-center">Cargando...</div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                {['Nº', 'Fecha', 'Cliente', 'Contacto', 'Total', 'Estado', 'Encargado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {cotizaciones.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin cotizaciones</td></tr>
              )}
              {cotizaciones.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">COT-{String(c.numero).padStart(5, '0')}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-CL')}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{c.cliente?.nombre ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.contacto ?? '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{fmtMoney(c.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[c.estado] ?? ''}`}>
                      {ESTADO_LABELS[c.estado] ?? c.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.vendedor?.name ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/cotizaciones/${c.id}`)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="Ver/Editar"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => abrirPdf(c.id)}
                        className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
                        title="PDF"
                      >
                        <FileText size={15} />
                      </button>
                      <button
                        onClick={() => emailMut.mutate(c.id)}
                        disabled={emailMut.isPending}
                        className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                        title="Enviar email"
                      >
                        <Mail size={15} />
                      </button>
                      {c.estado === 'no_definido' && (
                        <button
                          onClick={() => { setDeleteId(c.id); setDeleteError('') }}
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar cotización?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Esta acción no se puede deshacer.</p>
            {deleteError && <p className="text-sm text-red-500 mb-3">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDeleteId(null); setDeleteError('') }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailToast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {emailToast.msg}
        </div>
      )}
    </div>
  )
}
