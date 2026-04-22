import { openPdf } from '../lib/pdf'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Mail, Trash2, Eye, Download, Filter, X } from 'lucide-react'
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

function MargenBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-gray-400 text-xs">—</span>
  const pct = Math.round(value * 1000) / 10
  const color = pct < 15
    ? 'text-red-600 dark:text-red-400'
    : pct < 25
    ? 'text-orange-500 dark:text-orange-400'
    : 'text-green-600 dark:text-green-400'
  return <span className={`font-medium text-sm font-num ${color}`}>{pct.toFixed(1)}%</span>
}

interface UserMin { id: number; name: string }
interface EmpresaMin { id: number; nombre: string }
interface ProductoMin { id: number; nombre: string; sku: string | null }

export default function Cotizaciones() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── Filter state ──────────────────────────────────────────────────────────
  const [estados, setEstados] = useState<string[]>([])
  const [estadoOpen, setEstadoOpen] = useState(false)
  const estadoRef = useRef<HTMLDivElement>(null)

  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [emisorId, setEmisorId] = useState<number | null>(null)
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [montoMin, setMontoMin] = useState('')
  const [montoMax, setMontoMax] = useState('')

  const [productoSearch, setProductoSearch] = useState('')
  const [productoId, setProductoId] = useState<number | null>(null)
  const [productoNombre, setProductoNombre] = useState('')
  const [productoOpen, setProductoOpen] = useState(false)
  const productoRef = useRef<HTMLDivElement>(null)

  const [filtersOpen, setFiltersOpen] = useState(false)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [emailToast, setEmailToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // ── Outside click handlers ─────────────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (estadoRef.current && !estadoRef.current.contains(e.target as Node)) setEstadoOpen(false)
      if (productoRef.current && !productoRef.current.contains(e.target as Node)) setProductoOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Reference data ────────────────────────────────────────────────────────
  const { data: users = [] } = useQuery<UserMin[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/api/users').then(r => r.data),
    staleTime: 5 * 60_000,
  })
  const { data: empresas = [] } = useQuery<EmpresaMin[]>({
    queryKey: ['empresas-list'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
    staleTime: 5 * 60_000,
  })
  const { data: productoResults = [] } = useQuery<ProductoMin[]>({
    queryKey: ['productos-search', productoSearch],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(productoSearch)}`).then(r => r.data),
    enabled: productoSearch.length >= 2 && !productoId,
    staleTime: 30_000,
  })

  // ── Build query params ────────────────────────────────────────────────────
  const params = new URLSearchParams()
  estados.forEach(e => params.append('estado', e))
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)
  if (emisorId) params.set('vendedor_id', String(emisorId))
  if (empresaId) params.set('empresa_id', String(empresaId))
  if (montoMin) params.set('monto_min', montoMin)
  if (montoMax) params.set('monto_max', montoMax)
  if (productoId) params.set('producto_id', String(productoId))

  const activeFilterCount = [
    estados.length > 0, !!fechaDesde, !!fechaHasta, !!emisorId,
    !!empresaId, !!montoMin, !!montoMax, !!productoId,
  ].filter(Boolean).length

  const { data: cotizaciones = [], isLoading } = useQuery<Cotizacion[]>({
    queryKey: ['cotizaciones', estados, fechaDesde, fechaHasta, emisorId, empresaId, montoMin, montoMax, productoId],
    queryFn: () => api.get(`/api/cotizaciones/?${params.toString()}`).then(r => r.data),
  })

  function clearFilters() {
    setEstados([]); setFechaDesde(''); setFechaHasta('')
    setEmisorId(null); setEmpresaId(null)
    setMontoMin(''); setMontoMax('')
    setProductoId(null); setProductoNombre(''); setProductoSearch('')
  }

  function handleExport() {
    const p = new URLSearchParams(params)
    window.open(`/api/cotizaciones/export/excel?${p.toString()}`, '_blank')
  }

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

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
  const selectCls = `${inputCls} cursor-pointer`

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Cotizaciones</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Exportar a Excel"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            onClick={() => navigate('/cotizaciones/nueva')}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-brand-500 hover:bg-brand-400 text-gray-900 text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nueva cotización</span>
            <span className="sm:hidden">Nueva</span>
          </button>
        </div>
      </div>

      {/* ── Filters toggle ── */}
      <div className="mb-3">
        <button
          onClick={() => setFiltersOpen(o => !o)}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
            ${activeFilterCount > 0
              ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
        >
          <Filter size={15} />
          Filtros
          {activeFilterCount > 0 && (
            <span className="bg-brand-500 text-gray-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Filter panel ── */}
      {filtersOpen && (
        <div className="mb-4 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* Estado */}
            <div ref={estadoRef} className="relative">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Estado</label>
              <button
                type="button"
                onClick={() => setEstadoOpen(o => !o)}
                className={`${inputCls} flex items-center justify-between`}
              >
                <span className="truncate">
                  {estados.length === 0 ? 'Todos' : estados.map(e => ESTADO_LABELS[e] ?? e).join(', ')}
                </span>
                <svg className="ml-2 h-4 w-4 flex-shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {estadoOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                  {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-white">
                      <input
                        type="checkbox"
                        checked={estados.includes(value)}
                        onChange={e => setEstados(prev => e.target.checked ? [...prev, value] : prev.filter(v => v !== value))}
                        className="rounded border-gray-300"
                      />
                      {label}
                    </label>
                  ))}
                  {estados.length > 0 && (
                    <button onClick={() => setEstados([])} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 dark:border-gray-700 mt-1">
                      Limpiar
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Emisor */}
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Emisor</label>
              <select value={emisorId ?? ''} onChange={e => setEmisorId(e.target.value ? Number(e.target.value) : null)} className={selectCls}>
                <option value="">Todos</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            {/* Empresa */}
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Empresa cliente</label>
              <select value={empresaId ?? ''} onChange={e => setEmpresaId(e.target.value ? Number(e.target.value) : null)} className={selectCls}>
                <option value="">Todas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>

            {/* Fecha desde */}
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha desde</label>
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className={inputCls} />
            </div>

            {/* Fecha hasta */}
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha hasta</label>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className={inputCls} />
            </div>

            {/* Monto */}
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Monto total</label>
              <div className="flex gap-2">
                <input type="number" placeholder="Mín" value={montoMin} onChange={e => setMontoMin(e.target.value)}
                  className={`${inputCls} flex-1`} />
                <input type="number" placeholder="Máx" value={montoMax} onChange={e => setMontoMax(e.target.value)}
                  className={`${inputCls} flex-1`} />
              </div>
            </div>

            {/* Producto */}
            <div ref={productoRef} className="relative sm:col-span-2 lg:col-span-1">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Producto</label>
              {productoId ? (
                <div className={`${inputCls} flex items-center justify-between`}>
                  <span className="truncate text-gray-900 dark:text-white">{productoNombre}</span>
                  <button onClick={() => { setProductoId(null); setProductoNombre(''); setProductoSearch('') }}
                    className="ml-2 text-gray-400 hover:text-gray-600 flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Buscar producto..."
                  value={productoSearch}
                  onChange={e => { setProductoSearch(e.target.value); setProductoOpen(true) }}
                  onFocus={() => productoSearch.length >= 2 && setProductoOpen(true)}
                  className={inputCls}
                />
              )}
              {productoOpen && productoResults.length > 0 && !productoId && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
                  {productoResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setProductoId(p.id); setProductoNombre(p.nombre); setProductoSearch(''); setProductoOpen(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <span className="font-medium">{p.nombre}</span>
                      {p.sku && <span className="ml-2 text-xs text-gray-400">{p.sku}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>

          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline">
              Limpiar todos los filtros
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400 py-12 text-center text-sm">Cargando...</div>
      ) : cotizaciones.length === 0 ? (
        <div className="text-gray-400 py-12 text-center text-sm">Sin cotizaciones</div>
      ) : (
        <>
          {/* ── Mobile cards ── */}
          <div className="md:hidden space-y-2">
            {cotizaciones.map(c => (
              <div key={c.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-num">
                      COT-{String(c.numero).padStart(5, '0')}
                    </span>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight mt-0.5">
                      {c.cliente?.nombre ?? '—'}
                    </p>
                    {c.empresa?.nombre && (
                      <p className="text-xs text-gray-400 leading-tight">{c.empresa.nombre}</p>
                    )}
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
                  <div className="flex items-center gap-3">
                    <MargenBadge value={c.margen_total} />
                    <span className="font-semibold text-gray-900 dark:text-white text-sm font-num">
                      {fmtMoney(c.total)}
                    </span>
                  </div>
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

          {/* ── Desktop table ── */}
          <div className="hidden md:block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  {['Nº', 'Fecha', 'Cliente / Empresa', 'Total', 'Margen', 'Estado', 'Encargado', 'Acciones'].map(h => (
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
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-white leading-tight">{c.cliente?.nombre ?? '-'}</div>
                      {c.empresa?.nombre && (
                        <div className="text-xs text-gray-400 leading-tight">{c.empresa.nombre}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap font-num">
                      {fmtMoney(c.total)}
                    </td>
                    <td className="px-4 py-3">
                      <MargenBadge value={c.margen_total} />
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

      {/* ── Delete modal ── */}
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
