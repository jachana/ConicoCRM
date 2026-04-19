import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Cliente, Empresa } from '../types'

type FormData = {
  nombre: string
  rut: string
  email: string
  telefono: string
  direccion_despacho: string
  notas: string
  empresa_id: number | null
  recibe_correo: boolean
  forma_pago: string
  despacho_o_retiro: string
  comuna: string
  ultimo_contacto: string
  forma_captacion: string
  compromiso: string
  es_nuevo: boolean
}

const EMPTY_FORM: FormData = {
  nombre: '', rut: '', email: '', telefono: '', direccion_despacho: '', notas: '',
  empresa_id: null, recibe_correo: true, forma_pago: '', despacho_o_retiro: '',
  comuna: '', ultimo_contacto: '', forma_captacion: '', compromiso: '', es_nuevo: false,
}

const INPUT_CLS = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
const LABEL_CLS = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
const READONLY_CLS = "w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400"

export default function Clientes() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ['clientes', busqueda],
    queryFn: () => api.get(`/api/clientes/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get('/api/empresas/').then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const empresaSeleccionada = empresas.find(e => e.id === form.empresa_id) ?? null

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setError(null); setModalOpen(true)
  }

  function abrirEditar(c: Cliente) {
    setEditando(c)
    setForm({
      nombre: c.nombre, rut: c.rut ?? '', email: c.email ?? '', telefono: c.telefono ?? '',
      direccion_despacho: c.direccion_despacho ?? '', notas: c.notas ?? '',
      empresa_id: c.empresa_id, recibe_correo: c.recibe_correo,
      forma_pago: c.forma_pago ?? '', despacho_o_retiro: c.despacho_o_retiro ?? '',
      comuna: c.comuna ?? '', ultimo_contacto: c.ultimo_contacto ?? '',
      forma_captacion: c.forma_captacion ?? '', compromiso: c.compromiso ?? '',
      es_nuevo: c.es_nuevo,
    })
    setError(null); setModalOpen(true)
  }

  function cerrarModal() { setModalOpen(false); setEditando(null); setError(null) }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
        ),
        recibe_correo: data.recibe_correo,
        es_nuevo: data.es_nuevo,
        empresa_id: data.empresa_id,
      }
      if (editando) return api.patch(`/api/clientes/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/clientes/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/clientes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); setEliminandoId(null); setDeleteError(null) },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Clientes</h1>
        <div className="flex gap-2">
          <button
            onClick={() => api.get('/api/clientes/export/excel', { responseType: 'blob' }).then(r => {
              const url = URL.createObjectURL(r.data)
              const a = document.createElement('a'); a.href = url; a.download = 'clientes.xlsx'; a.click()
              URL.revokeObjectURL(url)
            })}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exportar Excel
          </button>
          <button onClick={abrirCrear} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
            Agregar cliente
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
              <th className="text-left px-4 py-3 font-medium">Empresa</th>
              <th className="text-left px-4 py-3 font-medium">RUT</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {clientes.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin clientes registrados</td></tr>
            )}
            {clientes.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{c.nombre}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.empresa?.nombre ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.rut ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{c.telefono ?? '—'}</td>
                <td className="px-4 py-3">
                  {eliminandoId === c.id ? (
                    <span className="inline-flex items-center gap-2 text-xs">
                      {deleteError
                        ? <span className="text-red-500">{deleteError}</span>
                        : <span className="text-gray-600 dark:text-gray-400">¿Eliminar?</span>}
                      <button onClick={() => eliminar.mutate(c.id)} disabled={eliminar.isPending} className="text-red-600 hover:underline font-medium disabled:opacity-50">Sí</button>
                      <button onClick={() => { setEliminandoId(null); setDeleteError(null) }} className="text-gray-500 hover:underline">No</button>
                    </span>
                  ) : (
                    <span className="inline-flex gap-3">
                      <button onClick={() => abrirEditar(c)} className="text-xs text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => { setEliminandoId(c.id); setDeleteError(null) }} className="text-xs text-red-500 hover:underline">Eliminar</button>
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
                {editando ? 'Editar cliente' : 'Nuevo cliente'}
              </h2>
            </div>
            <form onSubmit={ev => { ev.preventDefault(); guardar.mutate(form) }} className="px-6 py-4 grid grid-cols-2 gap-4">

              {/* Empresa */}
              <div className="col-span-2">
                <label className={LABEL_CLS}>Empresa</label>
                <select
                  value={form.empresa_id ?? ''}
                  onChange={e => setForm(f => ({ ...f, empresa_id: e.target.value ? Number(e.target.value) : null }))}
                  className={INPUT_CLS}
                >
                  <option value="">— Sin empresa —</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>

              {/* Inherited read-only fields from empresa */}
              {empresaSeleccionada && (
                <>
                  {empresaSeleccionada.rut && (
                    <div>
                      <label className={LABEL_CLS}>RUT Empresa</label>
                      <div className={READONLY_CLS}>{empresaSeleccionada.rut}</div>
                    </div>
                  )}
                  {empresaSeleccionada.razon_social && (
                    <div>
                      <label className={LABEL_CLS}>Razón Social</label>
                      <div className={READONLY_CLS}>{empresaSeleccionada.razon_social}</div>
                    </div>
                  )}
                </>
              )}

              {/* Core fields */}
              <div className="col-span-2">
                <label className={LABEL_CLS}>Nombre *</label>
                <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={INPUT_CLS} />
              </div>
              {(([
                { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
                { key: 'email', label: 'Email', placeholder: 'contacto@empresa.cl' },
                { key: 'telefono', label: 'Teléfono', placeholder: '+56 9 1234 5678' },
                { key: 'forma_pago', label: 'Forma de Pago' },
                { key: 'comuna', label: 'Comuna' },
              ]) as { key: keyof FormData; label: string; placeholder?: string }[]).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className={LABEL_CLS}>{label}</label>
                  <input type="text" placeholder={placeholder} value={form[key] as string}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className={INPUT_CLS} />
                </div>
              ))}

              <div>
                <label className={LABEL_CLS}>Despacho o Retiro</label>
                <select value={form.despacho_o_retiro} onChange={e => setForm(f => ({ ...f, despacho_o_retiro: e.target.value }))} className={INPUT_CLS}>
                  <option value="">— Sin definir —</option>
                  <option value="despacho">Despacho</option>
                  <option value="retiro">Retiro</option>
                </select>
              </div>

              <div>
                <label className={LABEL_CLS}>Último Contacto</label>
                <input type="date" value={form.ultimo_contacto} onChange={e => setForm(f => ({ ...f, ultimo_contacto: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div>
                <label className={LABEL_CLS}>Forma Captación</label>
                <input type="text" value={form.forma_captacion} onChange={e => setForm(f => ({ ...f, forma_captacion: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Dirección de Despacho</label>
                <input type="text" value={form.direccion_despacho} onChange={e => setForm(f => ({ ...f, direccion_despacho: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Compromiso</label>
                <textarea rows={2} value={form.compromiso} onChange={e => setForm(f => ({ ...f, compromiso: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Notas</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="recibe_correo" checked={form.recibe_correo} onChange={e => setForm(f => ({ ...f, recibe_correo: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                <label htmlFor="recibe_correo" className="text-sm text-gray-700 dark:text-gray-300">Recibe correo</label>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="es_nuevo" checked={form.es_nuevo} onChange={e => setForm(f => ({ ...f, es_nuevo: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                <label htmlFor="es_nuevo" className="text-sm text-gray-700 dark:text-gray-300">Es nuevo</label>
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
