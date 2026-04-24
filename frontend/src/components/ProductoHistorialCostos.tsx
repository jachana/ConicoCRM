import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { HistorialCostoItem } from '../types'

export default function ProductoHistorialCostos({ productoId }: { productoId: number }) {
  const { data, isLoading } = useQuery<HistorialCostoItem[]>({
    queryKey: ['producto-historial-costos', productoId],
    queryFn: () => api.get(`/api/productos/${productoId}/historial-costos`).then(r => r.data),
  })
  if (isLoading) return <div>Cargando…</div>
  if (!data || data.length === 0) return <div className="text-gray-500 dark:text-gray-400">Este producto no aparece en ninguna lista de precios.</div>
  return (
    <table className="min-w-full text-sm border border-gray-200 dark:border-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-800">
        <tr>
          <th className="px-3 py-2 text-left">Fecha</th>
          <th className="px-3 py-2 text-right">Costo</th>
          <th className="px-3 py-2 text-left">Lista</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r, idx) => (
          <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
            <td className="px-3 py-2">{new Date(r.fecha_subida).toLocaleString('es-CL')}</td>
            <td className="px-3 py-2 text-right">${Number(r.costo_unitario).toLocaleString('es-CL')}</td>
            <td className="px-3 py-2">
              <a className="text-blue-600 hover:underline" href={`/api/listas-precios/${r.lista_id}/download`} target="_blank" rel="noreferrer">
                {r.nombre_archivo}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
