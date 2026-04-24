import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { MovimientoPage } from '../types'

export default function ProductoHistorial({ productoId }: { productoId: number }) {
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  const { data, isLoading } = useQuery<MovimientoPage>({
    queryKey: ['producto-movimientos', productoId, page],
    queryFn: () => api.get(`/api/productos/${productoId}/movimientos`, {
      params: { page, page_size: PAGE_SIZE }
    }).then(r => r.data),
  })

  function exportar() {
    api.get(`/api/productos/${productoId}/movimientos/export`, { responseType: 'blob' })
      .then(r => {
        const url = URL.createObjectURL(r.data)
        const a = document.createElement('a')
        a.href = url; a.download = `movimientos_${productoId}.csv`; a.click()
        URL.revokeObjectURL(url)
      })
  }

  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{total} movimiento{total !== 1 ? 's' : ''}</span>
        <button onClick={exportar}
          className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          Exportar CSV
        </button>
      </div>

      {isLoading && <div className="text-sm text-gray-400">Cargando...</div>}

      {!isLoading && (data?.items ?? []).length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Sin movimientos</p>
      )}

      {!isLoading && (data?.items ?? []).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 pr-3">Fecha</th>
                <th className="text-left py-2 pr-3">Tipo</th>
                <th className="text-right py-2 pr-3">Cant.</th>
                <th className="text-left py-2 pr-3">Referencia</th>
                <th className="text-left py-2">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data!.items.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {new Date(m.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      m.signo > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>{m.tipo}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {m.signo > 0 ? '+' : '−'}{m.cantidad}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-500">
                    {m.referencia_tipo ? `${m.referencia_tipo} #${m.referencia_id}` : '—'}
                  </td>
                  <td className="py-1.5 text-gray-400">{m.motivo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1 text-xs border rounded disabled:opacity-40">Anterior</button>
          <span className="px-3 py-1 text-xs text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1 text-xs border rounded disabled:opacity-40">Siguiente</button>
        </div>
      )}
    </div>
  )
}
