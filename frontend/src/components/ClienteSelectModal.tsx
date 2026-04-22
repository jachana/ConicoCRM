import { useState, useEffect } from 'react'
import { ArrowLeft, UserPlus, X, Search } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { Cliente } from '../types'

type View = 'list' | 'create'

type FormData = {
  nombre: string; rut: string; email: string; telefono: string
  direccion_despacho: string; notas: string
  recibe_correo: boolean; despacho_o_retiro: string
  comuna: string; ultimo_contacto: string; forma_captacion: string
  compromiso: string; es_nuevo: boolean
}

const EMPTY_FORM: FormData = {
  nombre: '', rut: '', email: '', telefono: '', direccion_despacho: '', notas: '',
  recibe_correo: true, despacho_o_retiro: '',
  comuna: '', ultimo_contacto: '', forma_captacion: '', compromiso: '', es_nuevo: false,
}

const INPUT_CLS = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
const LABEL_CLS = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"

interface Props {
  open: boolean
  empresaId: number
  empresaNombre: string
  onSelect: (cliente: Cliente) => void
  onClose: () => void
}

export default function ClienteSelectModal({ open, empresaId, empresaNombre, onSelect, onClose }: Props) {
  const qc = useQueryClient()
  const [view, setView] = useState<View>('list')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setView('list'); setSearch(''); setForm(EMPTY_FORM); setFormError(null) }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const { data: clientes = [], isLoading } = useQuery<Cliente[]>({
    queryKey: ['clientes', { empresa_id: empresaId }],
    queryFn: () => api.get(`/api/clientes/?empresa_id=${empresaId}`).then(r => r.data),
    enabled: open && !!empresaId,
  })

  const crear = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])),
        empresa_id: empresaId,
        recibe_correo: data.recibe_correo,
        es_nuevo: data.es_nuevo,
      }
      return api.post<Cliente>('/api/clientes/', payload).then(r => r.data)
    },
    onSuccess: (newCliente) => {
      qc.invalidateQueries({ queryKey: ['clientes', { empresa_id: empresaId }] })
      toast.success('Cliente creado')
      onSelect(newCliente)
    },
    onError: (e: any) => setFormError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const filtered = clientes.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          {view === 'create' && (
            <button
              type="button"
              onClick={() => { setView('list'); setForm(EMPTY_FORM); setFormError(null) }}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              {view === 'list' ? 'Seleccionar cliente' : 'Nuevo cliente'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{empresaNombre}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {view === 'list' ? (
          <>
            {/* Search */}
            <div className="px-4 pt-3 pb-2 flex-shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 py-2 min-h-0">
              {isLoading ? (
                <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400 mb-3">
                    {search ? 'Sin resultados' : 'No hay clientes para esta empresa'}
                  </p>
                  {!search && (
                    <button
                      type="button"
                      onClick={() => setView('create')}
                      className="text-sm text-brand-500 hover:text-brand-600 font-medium"
                    >
                      Crear el primero
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map(c => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(c)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{c.nombre}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {[c.email, c.telefono].filter(Boolean).join(' · ')}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <button
                type="button"
                onClick={() => setView('create')}
                className="flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-600 font-medium"
              >
                <UserPlus size={14} />
                Nuevo cliente
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          /* Create view */
          <form
            onSubmit={e => { e.preventDefault(); crear.mutate(form) }}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="flex-1 overflow-y-auto px-5 py-4 grid grid-cols-2 gap-4">
              {/* Empresa (locked) */}
              <div className="col-span-2">
                <label className={LABEL_CLS}>Empresa</label>
                <div className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400">
                  {empresaNombre}
                </div>
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Nombre *</label>
                <input type="text" required value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={INPUT_CLS} autoFocus />
              </div>

              {(([
                { key: 'rut', label: 'RUT', placeholder: '76.123.456-7' },
                { key: 'email', label: 'Email', placeholder: 'contacto@empresa.cl' },
                { key: 'telefono', label: 'Teléfono', placeholder: '+56 9 1234 5678' },
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
                <select value={form.despacho_o_retiro}
                  onChange={e => setForm(f => ({ ...f, despacho_o_retiro: e.target.value }))} className={INPUT_CLS}>
                  <option value="">— Sin definir —</option>
                  <option value="despacho">Despacho</option>
                  <option value="retiro">Retiro</option>
                </select>
              </div>

              <div>
                <label className={LABEL_CLS}>Último Contacto</label>
                <input type="date" value={form.ultimo_contacto}
                  onChange={e => setForm(f => ({ ...f, ultimo_contacto: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div>
                <label className={LABEL_CLS}>Forma Captación</label>
                <input type="text" value={form.forma_captacion}
                  onChange={e => setForm(f => ({ ...f, forma_captacion: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Dirección de Despacho</label>
                <input type="text" value={form.direccion_despacho}
                  onChange={e => setForm(f => ({ ...f, direccion_despacho: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Compromiso</label>
                <textarea rows={2} value={form.compromiso}
                  onChange={e => setForm(f => ({ ...f, compromiso: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="col-span-2">
                <label className={LABEL_CLS}>Notas</label>
                <textarea rows={2} value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="modal_recibe_correo" checked={form.recibe_correo}
                  onChange={e => setForm(f => ({ ...f, recibe_correo: e.target.checked }))}
                  className="w-4 h-4 accent-brand-500 rounded" />
                <label htmlFor="modal_recibe_correo" className="text-sm text-gray-700 dark:text-gray-300">Recibe correo</label>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" id="modal_es_nuevo" checked={form.es_nuevo}
                  onChange={e => setForm(f => ({ ...f, es_nuevo: e.target.checked }))}
                  className="w-4 h-4 accent-brand-500 rounded" />
                <label htmlFor="modal_es_nuevo" className="text-sm text-gray-700 dark:text-gray-300">Es nuevo</label>
              </div>

              {formError && <p className="col-span-2 text-xs text-red-500">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                Cancelar
              </button>
              <button type="submit" disabled={crear.isPending}
                className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-400 text-gray-900 font-semibold rounded-lg disabled:opacity-50 transition-colors">
                {crear.isPending ? 'Guardando...' : 'Guardar y seleccionar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
