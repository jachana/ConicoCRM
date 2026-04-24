import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { LoteCosto } from '../types'

function formatPrecio(n: number) { return `$${Math.round(n).toLocaleString('es-CL')}` }

export default function ProductoLotes({ productoId }: { productoId: number }) {
  const { data: lotes = [], isLoading } = useQuery<LoteCosto[]>({
    queryKey: ['producto-lotes', productoId],
    queryFn: () => api.get(`/api/productos/${productoId}/lotes`).then(r => r.data),
  })

  if (isLoading) return <div className="text-sm text-gray-400">Cargando...</div>

  if (lotes.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Sin lotes activos en stock</p>
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        Lotes ordenados FIFO (el primero se consume primero).
        El precio costo del producto = máximo costo entre estos lotes.
      </p>
      <table className="w-full text-xs">
        <thead className="text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          <tr>
            <th className="text-left py-2 pr-3">Fecha entrada</th>
            <th className="text-right py-2 pr-3">Costo unit.</th>
            <th className="text-right py-2 pr-3">Cant. inicial</th>
            <th className="text-right py-2">Cant. restante</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {lotes.map((lote, i) => (
            <tr key={lote.id} className={i === 0 ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}>
              <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                {new Date(lote.created_at).toLocaleDateString('es-CL')}
                {i === 0 && <span className="ml-1 text-yellow-600 text-xs">(próximo)</span>}
              </td>
              <td className="py-1.5 pr-3 text-right font-mono">{formatPrecio(lote.costo_unitario)}</td>
              <td className="py-1.5 pr-3 text-right text-gray-500">{lote.cantidad_inicial}</td>
              <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-white">{lote.cantidad_restante}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
