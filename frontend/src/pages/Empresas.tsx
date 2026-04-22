import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Empresa, EmpresaListItem, DeudaBulkItem } from '../types'
import EmpresaFilters from '../components/EmpresaFilters'
import EmpresaDetailModal from '../components/EmpresaDetailModal'

const PLAZO_OPTIONS = ['Al contado', '30 Dias', '60 Dias', '90 Dias', 'Especial']

type FormData = {
  nombre: string
  razon_social: string
  rut: string
  forma_pago: string
  linea_credito: string
  limite_credito: string
  plazo_credito: string
  prioridad: string
  sector: string
  email: string
  nota_cobranza: string
  ubicacion: string
}

const EMPTY_FORM: FormData = {
  nombre: '', razon_social: '', rut: '', forma_pago: '',
  linea_credito: '', limite_credito: '', plazo_credito: '',
  prioridad: '', sector: '', email: '', nota_cobranza: '', ubicacion: '',
}

export default function Empresas() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBusqueda(busqueda), 300)
    return () => clearTimeout(t)
  }, [busqueda])

  const [sector, setSector] = useState<string | null>(null)
  const [productoIds, setProductoIds] = useState<number[]>([])
  const [productoNombres, setProductoNombres] = useState<string[]>([])
  const [detalleEmpresa, setDetalleEmpresa] = useState<EmpresaListItem | null>(null)

  const { data: empresas = [], isLoading } = useQuery<EmpresaListItem[]>({
    queryKey: ['empresas', debouncedBusqueda, sector, productoIds],
    queryFn: () => {
      const params = new URLSearchParams({ q: debouncedBusqueda })
      if (sector) params.set('sector', sector)
      productoIds.forEach(id => params.append('producto_ids', String(id)))
      return api.get(`/api/empresas/?${params.toString()}`).then(r => r.data)
    },
    placeholderData: keepPreviousData,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const { data: deudaBulk = [] } = useQuery<DeudaBulkItem[]>({
    queryKey: ['empresas-deuda-bulk'],
    queryFn: () => api.get('/api/empresas/deuda-bulk').then(r => r.data),
  })

  const deudaMap = useMemo(
    () => new Map<number, DeudaBulkItem>(deudaBulk.map(d => [d.empresa_id, d])),
    [deudaBulk]
  )

  type SortField = 'nombre' | 'rut' | 'sector' | 'forma_pago' | 'prioridad' | 'ultima_compra' | 'deuda_total' | 'deuda_vencida'
  const [sortField, setSortField] = useState<SortField>('deuda_total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterConDeuda, setFilterConDeuda] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (searchParams.get('create') !== 'true') return
    const rut = searchParams.get('rut') || ''
    const nombre = searchParams.get('nombre') || ''
    const email = searchParams.get('email') || ''
    setForm({ ...EMPTY_FORM, rut, nombre, email })
    setEditando(null)
    setModalOpen(true)
    setSearchParams({}, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalDeuda = deudaBulk.reduce((s, d) => s + Number(d.deuda_total), 0)
  const totalVencida = deudaBulk.reduce((s, d) => s + Number(d.deuda_vencida), 0)
  const empresasConDeuda = deudaBulk.filter(d => Number(d.deuda_total) > 0).length

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const displayEmpresas = [...empresas]
    .filter(e => !filterConDeuda || (deudaMap.get(e.id)?.deuda_total ?? 0) > 0)
    .sort((a, b) => {
      const da = deudaMap.get(a.id)
      const db = deudaMap.get(b.id)
      let cmp = 0
      if (sortField === 'deuda_total') {
        cmp = Number(da?.deuda_total ?? 0) - Number(db?.deuda_total ?? 0)
      } else if (sortField === 'deuda_vencida') {
        cmp = Number(da?.deuda_vencida ?? 0) - Number(db?.deuda_vencida ?? 0)
      } else if (sortField === 'ultima_compra') {
        const ta = a.ultima_compra ? new Date(a.ultima_compra + 'T00:00:00').getTime() : 0
        const tb = b.ultima_compra ? new Date(b.ultima_compra + 'T00:00:00').getTime() : 0
        cmp = ta - tb
      } else {
        const va = String(a[sortField as keyof EmpresaListItem] ?? '')
        const vb = String(b[sortField as keyof EmpresaListItem] ?? '')
        cmp = va.localeCompare(vb, 'es-CL')
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  function fmt(n: number) {
    return '$' + n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true)
  }

  function abrirEditar(e: Empresa) {
    setEditando(e)
    setForm({
      nombre: e.nombre, razon_social: e.razon_social ?? '', rut: e.rut ?? '',
      forma_pago: e.forma_pago ?? '',
      linea_credito: e.linea_credito != null ? String(e.linea_credito) : '',
      limite_credito: e.limite_credito != null ? String(e.limite_credito) : '',
      plazo_credito: e.plazo_credito ?? '',
      prioridad: e.prioridad ?? '', sector: e.sector ?? '',
      email: e.email ?? '', nota_cobranza: e.nota_cobranza ?? '', ubicacion: e.ubicacion ?? '',
    })
    setError(null); setModalOpen(true)
  }

  function cerrarModal() { setModalOpen(false); setEditando(null); setError(null) }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload: Record<string, unknown> = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v || null])
      )
      if (data.linea_credito) payload.linea_credito = parseFloat(data.linea_credito)
      else payload.linea_credito = null
      if (data.limite_credito) payload.limite_credito = parseFloat(data.limite_credito)
      else payload.limite_credito = null
      if (editando) return api.patch(`/api/empresas/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/empresas/', payload).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresas'] })
      qc.invalidateQueries({ queryKey: ['empresas-deuda-bulk'] })
      cerrarModal()
    },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/empresas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresas'] })
      qc.invalidateQueries({ queryKey: ['empresas-deuda-bulk'] })
      setEliminandoId(null)
      setDeleteError(null)
    },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Empresas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => api.get('/api/empresas/export/excel', { responseType: 'blob' }).then(r => {
              const url = URL.createObjectURL(r.data)
              const a = document.createElement('a'); a.href = url; a.download = 'empresas.xlsx'; a.click()
              URL.revokeObjectURL(url)
            })}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exportar Excel
          </button>
          <button
            onClick={abrirCrear}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Agregar empresa
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3 flex-wrap mb-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">Deuda Total</span>
          <span className="text-red-500 font-bold ml-2">{fmt(totalDeuda)}</span>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">Deuda Vencida</span>
          <span className={`font-bold ml-2 ${totalVencida > 0 ? 'text-orange-500' : 'text-gray-400'}`}>{fmt(totalVencida)}</span>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">Con Deuda</span>
          <span className="font-bold ml-2 text-gray-900 dark:text-white">{empresasConDeuda}</span>
        </div>
      </div>

      <EmpresaFilters
        busqueda={busqueda}
        onBusquedaChange={setBusqueda}
        sector={sector}
        onSectorChange={setSector}
        productoIds={productoIds}
        productoNombres={productoNombres}
        onProductosChange={(ids, nombres) => { setProductoIds(ids); setProductoNombres(nombres) }}
        filterConDeuda={filterConDeuda}
        onFilterConDeudaChange={setFilterConDeuda}
        totalCount={displayEmpresas.length}
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              {([
                { field: 'nombre' as SortField,        label: 'Nombre' },
                { field: 'rut' as SortField,           label: 'RUT' },
                { field: 'sector' as SortField,        label: 'Sector' },
                { field: 'forma_pago' as SortField,    label: 'Forma Pago' },
                { field: 'prioridad' as SortField,     label: 'Prioridad' },
                { field: 'ultima_compra' as SortField, label: 'Última Compra' },
                { field: 'deuda_total' as SortField,   label: 'Deuda' },
                { field: 'deuda_vencida' as SortField, label: 'Vencida' },
              ]).map(({ field, label }) => (
                <th key={field} onClick={() => toggleSort(field)}
                  aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="text-left px-4 py-3 font-medium whitespace-nowrap cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none">
                  {label}
                  {sortField === field
                    ? <span className="text-sky-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    : <span className="text-gray-400 ml-1">↕</span>}
                </th>
              ))}
              <th className="text-left px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {displayEmpresas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">Sin empresas registradas</td>
              </tr>
            )}
            {displayEmpresas.map(e => {
              const d = deudaMap.get(e.id)
              const deudaTotal = Number(d?.deuda_total ?? 0)
              const deudaVencida = Number(d?.deuda_vencida ?? 0)
              return (
                <tr key={e.id}
                  className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${deudaTotal === 0 ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{e.nombre}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">{e.rut ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">{e.sector ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">{e.forma_pago ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {e.prioridad
                      ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${e.prioridad === 'Alta' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}`}>{e.prioridad}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sky-500 dark:text-sky-400 text-sm whitespace-nowrap">
                    {e.ultima_compra
                      ? new Date(e.ultima_compra + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className={`px-4 py-3 font-semibold text-sm ${deudaTotal > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {deudaTotal > 0 ? fmt(deudaTotal) : '—'}
                  </td>
                  <td className={`px-4 py-3 text-sm ${deudaVencida > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                    {deudaVencida > 0 ? fmt(deudaVencida) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {eliminandoId === e.id ? (
                      <span className="inline-flex items-center gap-2 text-xs">
                        {deleteError
                          ? <span className="text-red-500">{deleteError}</span>
                          : <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>}
                        <button onClick={() => eliminar.mutate(e.id)} disabled={eliminar.isPending} className="text-red-600 hover:underline font-medium disabled:opacity-50">Sí</button>
                        <button onClick={() => { setEliminandoId(null); setDeleteError(null) }} className="text-gray-500 hover:underline">No</button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-2">
                        <button onClick={() => setDetalleEmpresa(e)}
                          className="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors">
                          Ver
                        </button>
                        <button onClick={() => abrirEditar(e)} aria-label={`Editar ${e.nombre}`} className="text-xs text-blue-600 hover:underline">Editar</button>
                        <button onClick={() => { setEliminandoId(e.id); setDeleteError(null) }} aria-label={`Eliminar ${e.nombre}`} className="text-xs text-red-500 hover:underline">Eliminar</button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <EmpresaDetailModal
        key={detalleEmpresa?.id}
        empresa={detalleEmpresa}
        onClose={() => setDetalleEmpresa(null)}
        onEdit={(e) => {
          setDetalleEmpresa(null)
          abrirEditar(e)
        }}
      />

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? 'Editar empresa' : 'Nueva empresa'}
              </h2>
            </div>
            <form onSubmit={ev => { ev.preventDefault(); guardar.mutate(form) }} className="px-6 py-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {(([
                { key: 'razon_social', label: 'Razón Social' },
                { key: 'rut', label: 'RUT *', placeholder: '76.123.456-7', required: true },
                { key: 'forma_pago', label: 'Forma de Pago' },
                { key: 'prioridad', label: 'Prioridad' },
                { key: 'sector', label: 'Sector' },
                { key: 'email', label: 'Email' },
              ]) as { key: keyof FormData; label: string; placeholder?: string; required?: boolean }[]).map(({ key, label, placeholder, required }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input type="text" placeholder={placeholder} required={required} value={form[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Línea de Crédito ($)</label>
                <input type="number" min="0" step="0.01" value={form.linea_credito} onChange={e => setForm(f => ({ ...f, linea_credito: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Límite de Crédito ($)</label>
                <input type="number" min="0" step="0.01" value={form.limite_credito} onChange={e => setForm(f => ({ ...f, limite_credito: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Plazo de Crédito</label>
                <select value={form.plazo_credito} onChange={e => setForm(f => ({ ...f, plazo_credito: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">— Sin plazo —</option>
                  {PLAZO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Ubicación sede central</label>
                <input type="text" value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nota Cobranza</label>
                <textarea rows={2} value={form.nota_cobranza} onChange={e => setForm(f => ({ ...f, nota_cobranza: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {error && <p className="col-span-2 text-xs text-red-500">{error}</p>}
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={cerrarModal} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancelar</button>
                <button type="submit" disabled={guardar.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                  {guardar.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
