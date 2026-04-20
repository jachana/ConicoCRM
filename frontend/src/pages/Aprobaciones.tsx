import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

interface AprobacionOut {
  id: number
  vendedor_id: number | null
  empresa_id: number | null
  total: number
  nota: string | null
  estado: string
  origen: string
  cotizacion_id: number | null
  nv_id: number | null
  created_at: string
  vendedor: { id: number; name: string; email: string } | null
  empresa: { id: number; nombre: string } | null
}

export default function Aprobaciones() {
  const user = useAuthStore(s => s.user)
  const queryClient = useQueryClient()
  const [actingId, setActingId] = useState<number | null>(null)

  if (!user || user.role === 'vendedor') return <Navigate to="/" replace />

  const { data: aprobaciones = [], isLoading } = useQuery<AprobacionOut[]>({
    queryKey: ['aprobaciones-pendientes'],
    queryFn: () => api.get('/api/aprobaciones/?estado=pendiente').then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobar' | 'denegar' }) =>
      api.patch(`/api/aprobaciones/${id}`, { accion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aprobaciones-pendientes'] })
      setActingId(null)
    },
    onError: () => setActingId(null),
  })

  const handleAccion = (id: number, accion: 'aprobar' | 'denegar') => {
    setActingId(id)
    mutation.mutate({ id, accion })
  }

  const formatTotal = (n: number) => `$ ${Math.round(n).toLocaleString('es-CL')}`
  const formatFecha = (s: string) => s.split('T')[0]

  return (
    <div className="p-4 md:p-6 max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Aprobaciones de Crédito
      </h1>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Cargando...
          </div>
        ) : aprobaciones.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No hay solicitudes pendientes.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Vendedor</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Nota</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {aprobaciones.map(a => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {a.empresa?.nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {a.vendedor?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">
                    {formatTotal(a.total)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                    {a.nota ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {formatFecha(a.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAccion(a.id, 'aprobar')}
                        disabled={actingId !== null}
                        className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => handleAccion(a.id, 'denegar')}
                        disabled={actingId !== null}
                        className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                      >
                        Denegar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
