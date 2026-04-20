import { openPdf } from '../lib/pdf'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Trash2, Eye, Download } from 'lucide-react'
import { api } from '../lib/api'
import type { OrdenCompra, Proveedor } from '../types'

const ESTADO_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  recibida_parcial: 'Recibida parcial',
  recibida_completa: 'Recibida completa',
  cancelada: 'Cancelada',
}

const ESTADO_COLORS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  enviada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  recibida_parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  recibida_completa: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  cancelada: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

function fmtMoney(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`
}

export default function OrdenesCompra() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [proveedorId, setProveedorId] = useState('')
  const [estado, setEstado] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const params = new URLSearchParams()
  if (proveedorId) params.set('proveedor_id', proveedorId)
  if (estado) params.set('estado', estado)
  if (fechaDesde) params.set('fecha_desde', fechaDesde)
  if (fechaHasta) params.set('fecha_hasta', fechaHasta)

  const { data: ordenes = [], isLoading } = useQuery<OrdenCompra[]>({
    queryKey: ['ordenes_compra', proveedorId, estado, fechaDesde, fechaHasta],
    queryFn: () => api.get(`/api/ordenes-compra/?${params.toString()}`).then(r => r.data),
  })

  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => api.get('/api/proveedores/').then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/ordenes-compra/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ordenes_compra'] })
      setDeleteId(null)
      setDeleteError('')
    },
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.detail || 'Error al eliminar')
    },
  })

  function abrirPdf(id: number) {
    openPdf(`/api/ordenes-compra/${id}/pdf`)
  }

  async function exportarExcel() {
    const r = await api.get('/api/ordenes-compra/export/excel', { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ordenes_compra.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Órdenes de Compra</h1>
        <div className="flex gap-2">
          <button
            onClick={exportarExcel}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Download size={16} /> Excel
          </button>
          <button
            onClick={() => navigate('/ordenes-compra/nueva')}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} /> Nueva OC
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={proveedorId}
          onChange={e => setProveedorId(e.target.value)}
          className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <select
          value={estado}
          onChange={e => setEstado(e.target.value)}
          className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input
          type="date"
          value={fechaDesde}
          onChange={e => setFechaDesde(e.target.value)}
          className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5"
          placeholder="Desde"
        />
        <input
          type="date"
          value={fechaHasta}
          onChange={e => setFechaHasta(e.target.value)}
          className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1.5"
          placeholder="Hasta"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {['Nº OC', 'Proveedor', 'Fecha', 'Entrega esperada', 'Estado', 'Total', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {ordenes.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-mono text-blue-600 dark:text-blue-400">OC-{String(o.numero).padStart(5, '0')}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{o.proveedor?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{o.fecha}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{o.fecha_entrega_esperada ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[o.estado] ?? ''}`}>
                      {ESTADO_LABELS[o.estado] ?? o.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{fmtMoney(o.total)}</td>
                  <td className="px-4 py-3">
                    {deleteId === o.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-red-600 dark:text-red-400 text-xs">{deleteError || '¿Eliminar?'}</span>
                        <button onClick={() => deleteMut.mutate(o.id)} className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">Sí</button>
                        <button onClick={() => { setDeleteId(null); setDeleteError('') }} className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800">No</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => navigate(`/ordenes-compra/${o.id}`)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400" title="Ver">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => abrirPdf(o.id)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400" title="PDF">
                          <FileText size={16} />
                        </button>
                        {o.estado === 'borrador' && (
                          <button onClick={() => setDeleteId(o.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400" title="Eliminar">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {ordenes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-gray-600">No hay órdenes de compra</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
