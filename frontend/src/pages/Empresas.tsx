import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Empresa } from '../types'

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

  const { data: empresas = [], isLoading } = useQuery<Empresa[]>({
    queryKey: ['empresas', busqueda],
    queryFn: () => api.get(`/api/empresas/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresas'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/empresas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresas'] }); setEliminandoId(null); setDeleteError(null) },
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

      <input
        type="text"
        placeholder="Buscar por nombre o RUT..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Razón Social</th>
              <th className="text-left px-4 py-3 font-medium">RUT</th>
              <th className="text-left px-4 py-3 font-medium">Forma Pago</th>
              <th className="text-left px-4 py-3 font-medium">Prioridad</th>
              <th className="text-left px-4 py-3 font-medium">Sector</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {empresas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin empresas registradas</td>
              </tr>
            )}
            {empresas.map(e => (
              <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{e.nombre}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.razon_social ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.rut ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.forma_pago ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.prioridad ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.sector ?? '—'}</td>
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
                      <button onClick={() => abrirEditar(e)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => { setEliminandoId(e.id); setDeleteError(null) }} className="text-xs text-red-500 hover:underline">Eliminar</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
                { key: 'forma_pago', label: 'Forma de Pago' },
                { key: 'prioridad', label: 'Prioridad' },
                { key: 'sector', label: 'Sector' },
                { key: 'email', label: 'Email' },
              ]) as { key: keyof FormData; label: string; placeholder?: string }[]).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input type="text" placeholder={placeholder} value={form[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
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
