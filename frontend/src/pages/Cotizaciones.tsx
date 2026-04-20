import { openPdf } from '../lib/pdf'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Mail, Trash2, Eye, ChevronRight } from 'lucide-react'
import { api } from '../lib/api'
import type { Cotizacion } from '../types'

const ESTADO_LABELS: Record<string, string> = {
  no_definido: 'Sin definir',
  abierta: 'Abierta',
  aprobada: 'Aprobada',
  cerrada_fv: 'Cerrada (FV)',
  rechazada: 'Rechazada',
}

const ESTADO_COLORS: Record<string, string> = {
  no_definido: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  abierta: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  aprobada: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cerrada_fv: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rechazada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

export default function Cotizaciones() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [estados, setEstados] = useState<string[]>([])
  const [estadoOpen, setEstadoOpen] = useState(false)
  const estadoRef = useRef<HTMLDivElement>(null)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (estadoRef.current && !estadoRef.current.contains(e.target as Node)) setEstadoOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const params = new URLSearchParams()
  estados.forEach(e => params.append('estado', e))
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)

  const { data: cotizaciones = [], isLoading } = useQuery<Cotizacion[]>({
    queryKey: ['cotizaciones', estados, fechaDesde, fechaHasta],
    queryFn: () => api.get(`/api/cotizaciones/?${params.toString()}`).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/cotizaciones/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cotizaciones'] }); setDeleteId(null); setDeleteError('') },
    onError: (err: any) => setDeleteError(err?.response?.data?.detail || 'Error al eliminar'),
  })

  const emailMut = useMutation({
    mutationFn: (id: number) => api.post(`/api/cotizaciones/${id}/email`),
    onSuccess: () => { setEmailToast({ msg: 'Email enviado correctamente', ok: true }); setTimeout(() => setEmailToast(null), 3500) },
    onError: (err: any) => { setEmailToast({ msg: err?.response?.data?.detail || 'Error al enviar email', ok: false }); setTimeout(() => setEmailToast(null), 4000) },
  })

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Cotizaciones</h1>
        <button
          onClick={() => navigate('/cotizaciones/nueva')}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-500 hover:bg-brand-400 text-gray-900 text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nueva cotización</span>
          <span className="sm:hidden">Nueva</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div ref={estadoRef} className="relative flex-1 min-w-[130px]">
          <button
            type="button"
            onClick={() => setEstadoOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <span className="truncate">
              {estados.length === 0 ? 'Todos los estados' : estados.map(e => ESTADO_LABELS[e] ?? e).join(', ')}
            </span>
            <svg className="ml-2 h-4 w-4 flex-shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          {estadoOpen && (
            <div className="absolute z-20 mt-1 w-full min-w-[160px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
              {[
                { value: 'no_definido', label: 'Sin definir' },
                { value: 'abierta', label: 'Abierta' },
                { value: 'aprobada', label: 'Aprobada' },
                { value: 'cerrada_fv', label: 'Cerrada (FV)' },
                { value: 'rechazada', label: 'Rechazada' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-white">
                  <input
                    type="checkbox"
                    checked={estados.includes(opt.value)}
                    onChange={e => setEstados(prev => e.target.checked ? [...prev, opt.value] : prev.filter(v => v !== opt.value))}
                    className="rounded border-gray-300"
                  />
                  {opt.label}
                </label>
              ))}
              {estados.length > 0 && (
                <button onClick={() => setEstados([])} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 dark:border-gray-700 mt-1 pt-1.5">
                  Limpiar
                </button>
              )}
            </div>
          )}
        </div>
        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
          className="flex-1 min-w-[130px] px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
          className="flex-1 min-w-[130px] px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
      </div>

      {isLoading ? (
        <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
      ) : cotizaciones.length === 0 ? (
        <div className="text-gray-400 py-12 text-center text-sm">Sin cotizaciones</div>
      ) : (
        <>
          {/* ── Mobile cards (hidden on md+) ── */}
          <div className="md:hidden space-y-2">
            {cotizaciones.map(c => (
              <div
                key={c.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-num">
                      COT-{String(c.numero).padStart(5, '0')}
                    </span>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight mt-0.5">
                      {c.cliente?.nombre ?? '—'}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[c.estado] ?? ''}`}>
                    {ESTADO_LABELS[c.estado] ?? c.estado}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-x-2">
                    <span>{new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-CL')}</span>
                    {c.vendedor?.name && <span>· {c.vendedor.name}</span>}
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white text-sm font-num">
                    {fmtMoney(c.total)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button onClick={() => navigate(`/cotizaciones/${c.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    <Eye size={14} /> Ver
                  </button>
                  <button onClick={() => openPdf(`/api/cotizaciones/${c.id}/pdf`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-orange-600 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
                    <FileText size={14} /> PDF
                  </button>
                  <button onClick={() => emailMut.mutate(c.id)} disabled={emailMut.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                    <Mail size={14} /> Email
                  </button>
                  {c.estado === 'no_definido' && (
                    <button onClick={() => { setDeleteId(c.id); setDeleteError('') }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 size={14} /> Borrar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop table (hidden on mobile) ── */}
          <div className="hidden md:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  {['Nº', 'Fecha', 'Cliente', 'Contacto', 'Total', 'Estado', 'Encargado', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {cotizaciones.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white font-num">
                      COT-{String(c.numero).padStart(5, '0')}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{c.cliente?.nombre ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.contacto ?? '-'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap font-num">
                      {fmtMoney(c.total)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[c.estado] ?? ''}`}>
                        {ESTADO_LABELS[c.estado] ?? c.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.vendedor?.name ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => navigate(`/cotizaciones/${c.id}`)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Ver/Editar">
                          <Eye size={15} />
                        </button>
                        <button onClick={() => openPdf(`/api/cotizaciones/${c.id}/pdf`)}
                          className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors" title="PDF">
                          <FileText size={15} />
                        </button>
                        <button onClick={() => emailMut.mutate(c.id)} disabled={emailMut.isPending}
                          className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors" title="Enviar email">
                          <Mail size={15} />
                        </button>
                        {c.estado === 'no_definido' && (
                          <button onClick={() => { setDeleteId(c.id); setDeleteError('') }}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Eliminar">
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
        </>
      )}

      {/* Delete confirm modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar cotización?</h2>
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

      {emailToast && (
        <div className={`fixed bottom-20 md:bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 ${emailToast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {emailToast.msg}
        </div>
      )}
    </div>
  )
}
