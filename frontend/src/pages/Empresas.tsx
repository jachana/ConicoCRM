import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Empresa, EmpresaDeuda, DeudaBulkItem } from '../types'

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

  const { data: empresas = [], isLoading } = useQuery<Empresa[]>({
    queryKey: ['empresas', debouncedBusqueda],
    queryFn: () => api.get(`/api/empresas/?q=${encodeURIComponent(debouncedBusqueda)}`).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deudaEmpresa, setDeudaEmpresa] = useState<Empresa | null>(null)

  const { data: deudaData, isLoading: deudaLoading } = useQuery<EmpresaDeuda>({
    queryKey: ['empresa-deuda', deudaEmpresa?.id],
    queryFn: () => api.get(`/api/empresas/${deudaEmpresa!.id}/deuda`).then(r => r.data),
    enabled: !!deudaEmpresa,
  })

  const { data: deudaBulk = [] } = useQuery<DeudaBulkItem[]>({
    queryKey: ['empresas-deuda-bulk'],
    queryFn: () => api.get('/api/empresas/deuda-bulk').then(r => r.data),
  })

  const deudaMap = useMemo(
    () => new Map<number, DeudaBulkItem>(deudaBulk.map(d => [d.empresa_id, d])),
    [deudaBulk]
  )

  const [sortField, setSortField] = useState<'deuda_total' | 'deuda_vencida' | 'nombre'>('deuda_total')
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

  function toggleSort(field: 'deuda_total' | 'deuda_vencida' | 'nombre') {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const displayEmpresas = [...empresas]
    .filter(e => !filterConDeuda || (deudaMap.get(e.id)?.deuda_total ?? 0) > 0)
    .sort((a, b) => {
      const da = deudaMap.get(a.id)
      const db2 = deudaMap.get(b.id)
      if (sortField === 'nombre') {
        const cmp = a.nombre.localeCompare(b.nombre)
        return sortDir === 'asc' ? cmp : -cmp
      }
      const va = Number(da?.[sortField] ?? 0)
      const vb = Number(db2?.[sortField] ?? 0)
      return sortDir === 'asc' ? va - vb : vb - va
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
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Deuda Total</p>
          <p className="text-lg font-semibold text-red-500">{fmt(totalDeuda)}</p>
          <p className="text-xs text-gray-400 mt-0.5">en {empresasConDeuda} empresa{empresasConDeuda !== 1 ? 's' : ''}</p>
        </div>
        <div className={`bg-white dark:bg-gray-900 rounded-xl border p-4 ${totalVencida > 0 ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-gray-800'}`}>
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Deuda Vencida</p>
          <p className={`text-lg font-semibold ${totalVencida > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>{fmt(totalVencida)}</p>
          {totalVencida > 0 && <p className="text-xs text-red-400 mt-0.5">requiere atención</p>}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Empresas con Deuda</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{empresasConDeuda} / {deudaBulk.length}</p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 mb-4 items-center">
        <input
          type="text"
          placeholder="Buscar por nombre o RUT..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
          onClick={() => setFilterConDeuda(f => !f)}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
            filterConDeuda
              ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
              : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {filterConDeuda ? '✕ Con Deuda' : 'Con Deuda'}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th
                className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => toggleSort('nombre')}
              >
                Nombre {sortField === 'nombre' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th className="text-left px-4 py-3 font-medium">Razón Social</th>
              <th className="text-left px-4 py-3 font-medium">RUT</th>
              <th className="text-left px-4 py-3 font-medium">Forma Pago</th>
              <th className="text-left px-4 py-3 font-medium">Prioridad</th>
              <th className="text-left px-4 py-3 font-medium">Sector</th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => toggleSort('deuda_total')}
              >
                Deuda {sortField === 'deuda_total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
                onClick={() => toggleSort('deuda_vencida')}
              >
                Vencida {sortField === 'deuda_vencida' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th className="text-right px-4 py-3 font-medium">Lím. Crédito</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {displayEmpresas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">Sin empresas registradas</td>
              </tr>
            )}
            {displayEmpresas.map(e => {
              const deuda = deudaMap.get(e.id)
              const deudaTotal = Number(deuda?.deuda_total ?? 0)
              const deudaVencida = Number(deuda?.deuda_vencida ?? 0)
              const hasDeuda = deudaTotal > 0
              const rowCls = hasDeuda
                ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors opacity-60'
              const plazo = deuda?.plazo_credito ?? e.plazo_credito
              const isNumericPlazo = plazo && plazo !== 'Especial' && plazo !== 'Al contado'
              return (
                <tr key={e.id} className={rowCls}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900 dark:text-white">{e.nombre}</span>
                    {plazo && (
                      <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-xs ${
                        isNumericPlazo
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {plazo === '30 Dias' ? '30d' : plazo === '60 Dias' ? '60d' : plazo === '90 Dias' ? '90d' : plazo}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.razon_social ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.rut ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.forma_pago ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.prioridad ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.sector ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {hasDeuda
                      ? <span className="font-medium text-red-500">{fmt(deudaTotal)}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deudaVencida > 0
                      ? <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{fmt(deudaVencida)}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">
                    {deuda?.limite_credito != null ? fmt(Number(deuda.limite_credito)) : (e.limite_credito != null ? fmt(Number(e.limite_credito)) : '—')}
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
                      <span className="inline-flex gap-3">
                        {hasDeuda && (
                          <button onClick={() => setDeudaEmpresa(e)} className="text-xs text-emerald-600 hover:underline">Deuda</button>
                        )}
                        <button onClick={() => abrirEditar(e)} className="text-xs text-blue-600 hover:underline">Editar</button>
                        <button onClick={() => { setEliminandoId(e.id); setDeleteError(null) }} className="text-xs text-red-500 hover:underline">Eliminar</button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {deudaEmpresa && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setDeudaEmpresa(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{deudaEmpresa.nombre}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Resumen de deuda — facturas activas</p>
              </div>
              <button onClick={() => setDeudaEmpresa(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
            </div>

            {deudaLoading ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">Cargando...</div>
            ) : deudaData ? (
              <div className="px-6 py-4">
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: 'Total Facturado', value: deudaData.total_facturado, cls: 'text-gray-900 dark:text-white' },
                    { label: 'Total Pagado', value: deudaData.total_pagado, cls: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Deuda Actual', value: deudaData.deuda, cls: deudaData.deuda > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400' },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
                      <p className={`text-base font-semibold ${cls}`}>
                        ${Number(value).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  ))}
                </div>

                {deudaData.facturas.length === 0 ? (
                  <p className="text-sm text-center text-gray-400 py-4">Sin facturas registradas</p>
                ) : (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Nº FAC</th>
                          <th className="text-left px-3 py-2 font-medium">Fecha</th>
                          <th className="text-left px-3 py-2 font-medium">Contacto</th>
                          <th className="text-right px-3 py-2 font-medium">Total</th>
                          <th className="text-right px-3 py-2 font-medium">Pagado</th>
                          <th className="text-right px-3 py-2 font-medium">Pendiente</th>
                          <th className="text-center px-3 py-2 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {deudaData.facturas.map(f => {
                          const pendiente = Number(f.total) - Number(f.monto_pagado)
                          const estadoCls: Record<string, string> = {
                            pagada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                            parcial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                            emitida: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                          }
                          return (
                            <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{f.numero}</td>
                              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{new Date(f.fecha + 'T00:00:00').toLocaleDateString('es-CL')}</td>
                              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{f.contacto ?? '—'}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">${Number(f.total).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">${Number(f.monto_pagado).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                              <td className={`px-3 py-2 text-right font-medium ${pendiente > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                                ${pendiente.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${estadoCls[f.estado] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                  {f.estado}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

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
