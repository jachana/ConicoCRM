import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Proveedor } from '../types'

const CAMPOS = [
  { key: 'nombre' as const, label: 'Nombre', required: true, colSpan: 2 },
  { key: 'rut' as const, label: 'RUT', required: false, colSpan: 1 },
  { key: 'contacto' as const, label: 'Contacto', required: false, colSpan: 1 },
  { key: 'email' as const, label: 'Email', required: false, colSpan: 1 },
  { key: 'telefono' as const, label: 'Teléfono', required: false, colSpan: 1 },
  { key: 'notas' as const, label: 'Notas', required: false, colSpan: 2, textarea: true },
] as const

type CampoKey = typeof CAMPOS[number]['key']
type FormData = Record<CampoKey, string>

const EMPTY_FORM: FormData = { nombre: '', rut: '', contacto: '', email: '', telefono: '', notas: '' }

export default function Proveedores() {
  const qc = useQueryClient()
  const { data: proveedores = [], isLoading } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/api/proveedores/').then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function abrirCrear() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setError(null)
    setModalOpen(true)
  }

  function abrirEditar(p: Proveedor) {
    setEditando(p)
    setForm({ nombre: p.nombre, rut: p.rut ?? '', contacto: p.contacto ?? '', email: p.email ?? '', telefono: p.telefono ?? '', notas: p.notas ?? '' })
    setError(null)
    setModalOpen(true)
  }

  function cerrarModal() {
    setModalOpen(false)
    setEditando(null)
    setError(null)
  }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || null]))
      if (editando) return api.patch(`/api/proveedores/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/proveedores/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/proveedores/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); setEliminandoId(null); setDeleteError(null) },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Proveedores</h1>
        <div className="flex gap-2">
          <a
            href="/api/proveedores/export/excel"
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exportar Excel
          </a>
          <button
            onClick={abrirCrear}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Agregar proveedor
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">RUT</th>
              <th className="text-left px-4 py-3 font-medium">Contacto</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {proveedores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin proveedores registrados</td>
              </tr>
            )}
            {proveedores.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{p.nombre}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.rut ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.contacto ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{p.telefono ?? '—'}</td>
                <td className="px-4 py-3">
                  {eliminandoId === p.id ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      {deleteError
                        ? <span className="text-red-500">{deleteError}</span>
                        : <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>}
                      <button onClick={() => eliminar.mutate(p.id)} disabled={eliminar.isPending} className="text-red-600 hover:underline font-medium disabled:opacity-50">Sí</button>
                      <button onClick={() => { setEliminandoId(null); setDeleteError(null) }} className="text-gray-500 hover:underline">No</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-3">
                      <button onClick={() => abrirEditar(p)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => setEliminandoId(p.id)} className="text-xs text-red-500 hover:underline">Eliminar</button>
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? 'Editar proveedor' : 'Nuevo proveedor'}
              </h2>
            </div>
            <form
              onSubmit={e => { e.preventDefault(); guardar.mutate(form) }}
              className="px-6 py-4 grid grid-cols-2 gap-4"
            >
              {CAMPOS.map(campo => (
                <div key={campo.key} className={campo.colSpan === 2 ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {campo.label}{campo.required && ' *'}
                  </label>
                  {('textarea' in campo && campo.textarea) ? (
                    <textarea
                      value={form[campo.key]}
                      onChange={e => setForm(f => ({ ...f, [campo.key]: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={form[campo.key]}
                      onChange={e => setForm(f => ({ ...f, [campo.key]: e.target.value }))}
                      required={campo.required}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  )}
                </div>
              ))}
              {error && <p className="col-span-2 text-xs text-red-500">{error}</p>}
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={cerrarModal} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardar.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                >
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
