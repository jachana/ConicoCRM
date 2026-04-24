import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Producto, Marca } from '../types'
import ProductoDocumentos from './ProductoDocumentos'
import ProductoHistorial from './ProductoHistorial'
import ProductoHistorialCostos from './ProductoHistorialCostos'

type Tab = 'datos' | 'documentos' | 'historial' | 'historial_costos'

type FormData = {
  nombre: string
  descripcion: string
  precio_venta: string
  margen: string
  stock_minimo: string
  proveedor_id: string
  marca_id: string
  volumen: string
}

const EMPTY_FORM: FormData = {
  nombre: '', descripcion: '', precio_venta: '0',
  margen: '0', stock_minimo: '0', proveedor_id: '', marca_id: '', volumen: '',
}

function calcMargen(costo: number, venta: string): string {
  const v = parseFloat(venta)
  if (!v || v <= 0 || costo <= 0) return '0'
  return (((v - costo) / v) * 100).toFixed(2)
}

function formatPrecio(n: number) { return `$${Math.round(n).toLocaleString('es-CL')}` }

interface Props {
  editando: Producto | null
  onClose: () => void
  userRole: string
}

export default function ProductoModal({ editando, onClose, userRole }: Props) {
  const qc = useQueryClient()
  const isAdmin = userRole === 'admin'
  const [tab, setTab] = useState<Tab>('datos')
  const [form, setForm] = useState<FormData>(() => {
    if (!editando) return EMPTY_FORM
    return {
      nombre: editando.nombre,
      descripcion: editando.descripcion ?? '',
      precio_venta: String(editando.precio_venta),
      margen: calcMargen(Number(editando.precio_costo ?? 0), String(editando.precio_venta)),
      stock_minimo: String(editando.stock_minimo),
      proveedor_id: editando.proveedor_id ? String(editando.proveedor_id) : '',
      marca_id: editando.marca_id ? String(editando.marca_id) : '',
      volumen: editando.volumen !== null ? String(editando.volumen) : '',
    }
  })
  const [formDirty, setFormDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: marcas = [] } = useQuery<Marca[]>({
    queryKey: ['marcas'],
    queryFn: () => api.get('/api/marcas/').then(r => r.data),
  })

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        precio_venta: parseFloat(data.precio_venta) || 0,
        stock_minimo: parseInt(data.stock_minimo) || 0,
        proveedor_id: data.proveedor_id ? parseInt(data.proveedor_id) : null,
        marca_id: data.marca_id ? parseInt(data.marca_id) : null,
        volumen: data.volumen ? parseFloat(data.volumen) : null,
      }
      if (editando) return api.patch(`/api/productos/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/productos/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); onClose() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const venta = parseFloat(form.precio_venta)
  const costo = Number(editando?.precio_costo ?? 0)
  const margenVal = parseFloat(form.margen)
  const priceError = formDirty && venta <= costo ? 'El precio de venta debe ser mayor al costo' : null

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t
      ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 pt-5 pb-0 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            {editando ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          {editando && (
            <div className="flex gap-1 -mb-px">
              <button className={tabClass('datos')} onClick={() => setTab('datos')}>Datos</button>
              <button className={tabClass('documentos')} onClick={() => setTab('documentos')}>Documentos</button>
              <button className={tabClass('historial')} onClick={() => setTab('historial')}>Historial</button>
              {isAdmin && <button className={tabClass('historial_costos')} onClick={() => setTab('historial_costos')}>Historial costos</button>}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'datos' && (
            <form
              onSubmit={e => { e.preventDefault(); setFormDirty(true); if (priceError) return; guardar.mutate(form) }}
              className="px-6 py-4 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" required value={form.nombre}
                  onChange={e => { setFormDirty(true); setForm(f => ({ ...f, nombre: e.target.value })) }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                <textarea rows={2} value={form.descripcion}
                  onChange={e => { setFormDirty(true); setForm(f => ({ ...f, descripcion: e.target.value })) }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              {/* Marca + Volumen */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Marca</label>
                <select value={form.marca_id}
                  onChange={e => { setFormDirty(true); setForm(f => ({ ...f, marca_id: e.target.value })) }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">Sin marca</option>
                  {marcas.filter(m => m.activa).map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Volumen (L)</label>
                <input type="number" min="0" step="0.01" value={form.volumen}
                  onChange={e => { setFormDirty(true); setForm(f => ({ ...f, volumen: e.target.value })) }}
                  placeholder="Ej: 4.5"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              {/* Venta (visible to all users) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Precio venta ($)</label>
                <input type="number" min="0" step="0.01" value={form.precio_venta}
                  onChange={e => {
                    setFormDirty(true)
                    const v = e.target.value
                    setForm(f => ({ ...f, precio_venta: v, margen: calcMargen(costo, v) }))
                  }}
                  className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none ${priceError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'}`} />
                {editando && (
                  <p className="mt-0.5 text-xs text-gray-400">+IVA: {formatPrecio(venta * 1.19)}</p>
                )}
                {priceError && <p className="mt-1 text-xs text-red-500">{priceError}</p>}
              </div>

              {isAdmin && (
                <>
                  {/* Costo (read-only) */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Precio costo ($) <span className="text-xs text-gray-400">(auto)</span>
                    </label>
                    <input type="text" readOnly value={editando ? formatPrecio(Number(editando.precio_costo ?? 0)) : '—'}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 cursor-not-allowed" />
                    {editando && (
                      <p className="mt-0.5 text-xs text-gray-400">+IVA: {formatPrecio(Number(editando.costo_con_iva ?? 0))}</p>
                    )}
                  </div>

                  {/* Margen */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Margen (%)</label>
                    <input type="number" min="0" max="99" step="0.01" value={form.margen}
                      onChange={e => {
                        setFormDirty(true)
                        const m = parseFloat(e.target.value)
                        setForm(f => {
                          if (!isNaN(m) && m > 0 && m < 100 && costo > 0) {
                            return { ...f, margen: e.target.value, precio_venta: (costo / (1 - m / 100)).toFixed(2) }
                          }
                          return { ...f, margen: e.target.value }
                        })
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>

                  <div className="col-span-2">
                    {editando?.precio_costo_actualizado_en ? (
                      <p className={`text-sm ${editando.costo_desactualizado ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        Costo actualizado: {new Date(editando.precio_costo_actualizado_en).toLocaleDateString('es-CL')}
                        {editando.costo_desactualizado && ' — ⚠ desactualizado'}
                      </p>
                    ) : (
                      <p className="text-sm text-red-600 font-semibold">Costo nunca actualizado desde una lista</p>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Stock mínimo</label>
                <input type="number" min="0" value={form.stock_minimo}
                  onChange={e => { setFormDirty(true); setForm(f => ({ ...f, stock_minimo: e.target.value })) }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              {error && <div className="col-span-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>}

              <div className="col-span-2 flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancelar
                </button>
                <button type="submit" disabled={guardar.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                  {guardar.isPending ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          )}

          {tab === 'documentos' && editando && (
            <div className="px-6 py-4">
              <ProductoDocumentos productoId={editando.id} />
            </div>
          )}

          {tab === 'historial' && editando && (
            <div className="px-6 py-4">
              <ProductoHistorial productoId={editando.id} />
            </div>
          )}

          {tab === 'historial_costos' && editando && isAdmin && (
            <div className="px-6 py-4">
              <ProductoHistorialCostos productoId={editando.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
