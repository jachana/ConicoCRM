import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Producto } from '../types'

type FormData = {
  nombre: string
  descripcion: string
  precio_costo: string
  precio_venta: string
  margen: string        // UI-only, never sent to API
  stock_minimo: string
  stock_actual: string
  proveedor_id: string
}

const EMPTY_FORM: FormData = {
  nombre: '', descripcion: '', precio_costo: '0', precio_venta: '0',
  margen: '0', stock_minimo: '0', stock_actual: '0', proveedor_id: '',
}

function formatPrecio(n: number) {
  return `$${Math.round(n)}`
}

function calcMargen(costo: string, venta: string): string {
  const c = parseFloat(costo)
  const v = parseFloat(venta)
  if (!v || v <= 0) return '0'
  const m = ((v - c) / v) * 100
  return isNaN(m) ? '0' : m.toFixed(2)
}

export default function Productos() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos', busqueda],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [formDirty, setFormDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function abrirCrear() {
    setEditando(null); setForm(EMPTY_FORM); setFormDirty(false); setError(null); setModalOpen(true)
  }

  function abrirEditar(p: Producto) {
    setEditando(p)
    const costo = String(p.precio_costo)
    const venta = String(p.precio_venta)
    setForm({
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio_costo: costo,
      precio_venta: venta,
      margen: calcMargen(costo, venta),
      stock_minimo: String(p.stock_minimo),
      stock_actual: String(p.stock_actual),
      proveedor_id: p.proveedor_id ? String(p.proveedor_id) : '',
    })
    setError(null); setFormDirty(false); setModalOpen(true)
  }

  function cerrarModal() { setModalOpen(false); setEditando(null); setError(null); setFormDirty(false) }

  const guardar = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        precio_costo: parseFloat(data.precio_costo) || 0,
        precio_venta: parseFloat(data.precio_venta) || 0,
        stock_minimo: parseInt(data.stock_minimo) || 0,
        stock_actual: parseInt(data.stock_actual) || 0,
        proveedor_id: data.proveedor_id ? parseInt(data.proveedor_id) : null,
      }
      if (editando) return api.patch(`/api/productos/${editando.id}`, payload).then(r => r.data)
      return api.post('/api/productos/', payload).then(r => r.data)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); cerrarModal() },
    onError: (e: any) => setError(e?.response?.data?.detail ?? 'Error al guardar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/productos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); setEliminandoId(null); setDeleteError(null) },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  function handleCostoChange(val: string) {
    setFormDirty(true)
    setForm(f => {
      const m = parseFloat(f.margen)
      const c = parseFloat(val)
      if (!isNaN(m) && m > 0 && m < 100 && !isNaN(c) && c > 0) {
        const newVenta = (c / (1 - m / 100)).toFixed(2)
        return { ...f, precio_costo: val, precio_venta: newVenta }
      }
      return { ...f, precio_costo: val }
    })
  }

  function handleVentaChange(val: string) {
    setFormDirty(true)
    setForm(f => {
      const costoNum = parseFloat(f.precio_costo)
      const newMargen = costoNum > 0 ? calcMargen(f.precio_costo, val) : f.margen
      return { ...f, precio_venta: val, margen: newMargen }
    })
  }

  function handleMargenChange(val: string) {
    setFormDirty(true)
    setForm(f => {
      const m = parseFloat(val)
      const c = parseFloat(f.precio_costo)
      if (!isNaN(m) && m > 0 && m < 100 && !isNaN(c) && c > 0) {
        const newVenta = (c / (1 - m / 100)).toFixed(2)
        return { ...f, margen: val, precio_venta: newVenta }
      }
      return { ...f, margen: val }
    })
  }

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

  const costo = parseFloat(form.precio_costo)
  const venta = parseFloat(form.precio_venta)
  const margenVal = parseFloat(form.margen)
  const priceError =
    venta <= costo ? 'El precio de venta debe ser mayor al costo' :
    margenVal <= 0 ? 'El margen debe ser mayor a 0%' :
    null

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Catálogo de productos</h1>
        <div className="flex gap-2">
          <button
            onClick={() => api.get('/api/productos/export/excel', { responseType: 'blob' }).then(r => { const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = 'catalogo.xlsx'; a.click(); URL.revokeObjectURL(url) })}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Exportar Excel
          </button>
          <button
            onClick={abrirCrear}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Agregar producto
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="mb-4 w-full max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-right px-4 py-3 font-medium">Precio costo</th>
              <th className="text-right px-4 py-3 font-medium">Precio venta</th>
              <th className="text-right px-4 py-3 font-medium">Stock</th>
              <th className="text-right px-4 py-3 font-medium">Mín.</th>
              <th className="text-left px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {productos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin productos registrados</td>
              </tr>
            )}
            {productos.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white">{p.nombre}</div>
                  {p.descripcion && <div className="text-xs text-gray-400 truncate max-w-xs">{p.descripcion}</div>}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{formatPrecio(p.precio_costo)}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{formatPrecio(p.precio_venta)}</td>
                <td className={`px-4 py-2 text-right font-medium ${p.stock_actual < p.stock_minimo ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-900 dark:text-white'}`}>
                  {p.stock_actual}
                  {p.stock_actual < p.stock_minimo && (
                    <span className="ml-1 text-xs text-red-500" title="Stock bajo mínimo">⚠</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-400">{p.stock_minimo}</td>
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
                      <button onClick={() => { setEliminandoId(p.id); setDeleteError(null) }} className="text-xs text-red-500 hover:underline">Eliminar</button>
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editando ? 'Editar producto' : 'Nuevo producto'}
              </h2>
            </div>
            <form onSubmit={e => { e.preventDefault(); guardar.mutate(form) }} className="px-6 py-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                <textarea rows={2} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {/* Triangle: Costo */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Precio costo ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.precio_costo}
                  onChange={e => handleCostoChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Triangle: Venta */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Precio venta ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.precio_venta}
                  onChange={e => handleVentaChange(e.target.value)}
                  className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none ${
                    formDirty && venta <= costo ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {formDirty && venta <= costo && (
                  <p className="mt-1 text-xs text-red-500">El precio de venta debe ser mayor al costo</p>
                )}
              </div>

              {/* Triangle: Margen */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Margen (%)</label>
                <div className="relative">
                  <input
                    type="number" min="0" step="0.01"
                    value={form.margen}
                    onChange={e => handleMargenChange(e.target.value)}
                    className={`w-full px-3 py-2 pr-7 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none ${
                      formDirty && margenVal <= 0 ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
                {formDirty && margenVal <= 0 && (
                  <p className="mt-1 text-xs text-red-500">Debe ser mayor a 0%</p>
                )}
              </div>

              {/* Stocks */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Stock mínimo</label>
                <input
                  type="number" min="0" step="1"
                  value={form.stock_minimo}
                  onChange={e => { setFormDirty(true); setForm(f => ({ ...f, stock_minimo: e.target.value })) }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Stock actual</label>
                <input
                  type="number" min="0" step="1"
                  value={form.stock_actual}
                  onChange={e => { setFormDirty(true); setForm(f => ({ ...f, stock_actual: e.target.value })) }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
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
