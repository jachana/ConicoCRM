import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Producto } from '../types'
import ProductoModal from '../components/ProductoModal'
import { useAuthStore } from '../stores/auth'

function formatPrecio(n: number) {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

export default function Productos() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const [busqueda, setBusqueda] = useState('')

  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ['productos', busqueda],
    queryFn: () => api.get(`/api/productos/?q=${encodeURIComponent(busqueda)}`).then(r => r.data),
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [eliminandoId, setEliminandoId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function abrirCrear() { setEditando(null); setModalOpen(true) }
  function abrirEditar(p: Producto) { setEditando(p); setModalOpen(true) }
  function cerrarModal() { setModalOpen(false); setEditando(null) }

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/api/productos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productos'] }); setEliminandoId(null); setDeleteError(null) },
    onError: (e: any) => setDeleteError(e?.response?.data?.detail ?? 'Error al eliminar'),
  })

  if (isLoading) return <div className="p-6 text-gray-500">Cargando...</div>

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
              <th className="text-left px-4 py-3 font-medium">Marca</th>
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
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin productos registrados</td>
              </tr>
            )}
            {productos.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white">{p.nombre}</div>
                  {p.descripcion && <div className="text-xs text-gray-400 truncate max-w-xs">{p.descripcion}</div>}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                  {p.marca ? p.marca.nombre : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">{formatPrecio(Number(p.precio_costo ?? 0))}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{formatPrecio(Number(p.precio_venta))}</td>
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
        <ProductoModal
          editando={editando}
          onClose={cerrarModal}
          userRole={user?.role ?? 'vendedor'}
        />
      )}
    </div>
  )
}
